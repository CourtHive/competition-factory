/**
 * getEpisodes - Transform point history into structured episodes
 *
 * Converts flat point history into enriched episodes with game/set/match
 * context. Each episode represents a single point with full contextual
 * information about game boundaries, set boundaries, and points needed
 * at each level.
 *
 * Ported from scoringVisualizations buildEpisodes() to provide this
 * functionality directly from the engine.
 */

import type {
  MatchUp,
  Episode,
  EpisodeNeeded,
  FormatStructure,
  Point,
  ScoreEntry,
  SetScore,
} from '@Types/scoring/types';
import { isLiveDecidingSet, resolveSetType, setHasTiebreak } from '@Tools/scoring/scoringUtilities';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/** A history point as the engine stores it: `addPoint` also records where it fell. */
type PlacedPoint = Point & { set?: number; game?: number; number?: number };

/** A non-point entry of the history timeline that changes a set's games. */
type Marker = { kind: 'game' } | { kind: 'set' };

interface PointGame {
  /** The point won its game. False for the last point of a game an addGame or addSet interrupted. */
  completesGame: boolean;
  /** The point won its game and, with it, the set. */
  completesSet: boolean;
}

export function getEpisodes(matchUp: MatchUp): Episode[] {
  if (!matchUp) return [];
  const points = matchUp.history?.points;
  if (!points || points.length === 0) return [];

  const isCompleted = matchUp.matchUpStatus === COMPLETED;
  const resolved = resolvePointGames(matchUp, points, readGaps(matchUp.history?.entries, points.length));
  const formatStructure = parse(matchUp.matchUpFormat);
  const episodes: Episode[] = [];

  for (let i = 0; i < points.length; i++) {
    const point: PlacedPoint = points[i];
    const nextPoint = i < points.length - 1 ? points[i + 1] : undefined;
    const isLastPoint = i === points.length - 1;
    const matchComplete = isLastPoint && isCompleted;

    const pointSet = point.set ?? 0;
    const pointGame = point.game ?? 0;
    const pointNumber = point.number ?? 0;

    const gameComplete = resolved[i].completesGame || matchComplete;
    const setComplete = resolved[i].completesSet || matchComplete;

    const gameWinner: 0 | 1 | undefined = gameComplete ? point.winner : undefined;
    const setWinner = resolveSetWinner(setComplete, matchUp, pointSet);
    const needed = buildNeeded(point);
    const nextService = nextPoint?.server ?? point.server ?? 0;
    const isTiebreak = detectTiebreak(matchUp, formatStructure, pointSet, pointGame);

    episodes.push({
      action: 'addPoint',
      point: {
        index: i,
        number: pointNumber,
        winner: point.winner,
        server: point.server,
        score: point.score,
        result: point.result,
      },
      game: {
        index: pointGame,
        isTiebreak,
        complete: gameComplete,
        winner: gameWinner,
      },
      set: {
        index: pointSet,
        complete: setComplete,
        winner: setWinner,
      },
      needed,
      nextService,
      result: point.result,
      complete: matchComplete,
    });
  }

  return episodes;
}

/**
 * The addGame and addSet entries around each point, from the unified timeline: `gaps[k]` holds those between
 * point k-1 and point k, `gaps[points.length]` those after the last point. Without a timeline every gap is empty.
 */
function readGaps(entries: ScoreEntry[] | undefined, pointCount: number): Marker[][] {
  const gaps: Marker[][] = Array.from({ length: pointCount + 1 }, () => []);
  if (!Array.isArray(entries)) return gaps;

  let nextPoint = 0;
  for (const entry of entries) {
    if (entry?.type === 'point') {
      nextPoint = (typeof entry.pointIndex === 'number' ? entry.pointIndex : nextPoint) + 1;
    } else if (entry?.type === 'game' || entry?.type === 'set') {
      gaps[Math.min(nextPoint, pointCount)].push({ kind: entry.type });
    }
  }
  return gaps;
}

/**
 * Whether each point won its game, from the engine's own accounting rather than from where the game index
 * changes. A point's `game` is the number of games its set had completed before that game began (won on points,
 * awarded by addGame, or seeded by setInitialScore), and an addGame that interrupts a game abandons the partial
 * game and awards it. So between two points of one set with `m` addGame entries between them, the earlier point
 * won its game exactly when the index advanced by `m + 1`. The last point of a set has no successor in it; the
 * set's own score settles it: its games are the point's `game`, plus one if the point won it, plus the addGame
 * entries that follow in the same set.
 */
function resolvePointGames(matchUp: MatchUp, points: PlacedPoint[], gaps: Marker[][]): PointGame[] {
  const sets = matchUp.score?.sets;
  return points.map((point, i) => {
    const next: PlacedPoint | undefined = points[i + 1];
    const between = gaps[i + 1];
    const game = point.game ?? 0;

    if (next && (next.set ?? 0) === (point.set ?? 0)) {
      const nextGame = next.game ?? 0;
      if (nextGame === game) return { completesGame: false, completesSet: false };
      const awards = between.filter((marker) => marker.kind === 'game').length;
      return { completesGame: nextGame - game - awards >= 1, completesSet: false };
    }

    // The point's set ends here, or the history does. Of the addGame entries before any addSet, those the next
    // point's game index says opened its own set are not this set's.
    const firstSet = between.findIndex((marker) => marker.kind === 'set');
    const upToSet = firstSet === -1 ? between : between.slice(0, firstSet);
    const awards = upToSet.filter((marker) => marker.kind === 'game').length;
    const nextSetAwards = next && firstSet === -1 ? Math.min(next.game ?? 0, awards) : 0;
    const trailing = awards - nextSetAwards;

    const set = sets?.[point.set ?? 0];
    if (!set) return { completesGame: !!next, completesSet: false };
    // A set total entered while this set was in play closed it with the declared score (scoring-engine spec
    // § 2.3, CA 2026-10-18): the point won its game only if it scored one ('0-0' after it), and the total,
    // not the point, closed the set.
    if (firstSet !== -1 && closedByTotal(point, set, awards))
      return { completesGame: point.score === '0-0', completesSet: false };
    const total = (set.side1Score ?? 0) + (set.side2Score ?? 0);
    const completesGame = total - game - trailing >= 1;
    return { completesGame, completesSet: completesGame && trailing === 0 && set.winningSide !== undefined };
  });
}

/**
 * Whether the set total after a point closed the point's own set: the point left its game unfinished, or the
 * set's declared games are more than the point's game, the game it won, and the games awarded after it.
 */
function closedByTotal(point: PlacedPoint, set: SetScore, awards: number): boolean {
  if (point.score !== '0-0') return true;
  const total = (set.side1Score ?? 0) + (set.side2Score ?? 0);
  return total !== (point.game ?? 0) + 1 + awards;
}

function resolveSetWinner(setComplete: boolean, matchUp: MatchUp, pointSet: number): 0 | 1 | undefined {
  if (!setComplete) return undefined;
  const currentSetObj = matchUp.score.sets[pointSet];
  if (currentSetObj?.winningSide !== undefined) {
    return (currentSetObj.winningSide - 1) as 0 | 1;
  }
  return undefined;
}

function buildNeeded(point): EpisodeNeeded {
  const needed: EpisodeNeeded = {};
  if (point.pointsToGame) needed.pointsToGame = point.pointsToGame;
  if (point.pointsToSet) needed.pointsToSet = point.pointsToSet;
  if (point.pointsToMatch) needed.pointsToMatch = point.pointsToMatch;
  if (point.gamesToSet) needed.gamesToSet = point.gamesToSet;
  if (point.isBreakpoint !== undefined) needed.isBreakpoint = point.isBreakpoint;
  return needed;
}

/**
 * Whether a point was played in a tiebreak game. The set's format decides: a tiebreak-only set (or a final-set
 * match tiebreak) is one, and a standard set is in its tiebreak when the games before this one are both sides at
 * `tiebreakAt` — `2 × tiebreakAt` games in a set still open, since any other split that large has a winner.
 */
function detectTiebreak(
  matchUp: MatchUp,
  formatStructure: FormatStructure | undefined,
  pointSet: number,
  pointGame: number,
): boolean {
  const currentSetObj = matchUp.score.sets[pointSet];
  if (currentSetObj?.isTiebreakOnly) return true;
  if (!formatStructure) return false;

  const setsWon: [number, number] = [0, 0];
  for (const set of matchUp.score.sets.slice(0, pointSet)) {
    if (set.winningSide === 1) setsWon[0]++;
    if (set.winningSide === 2) setsWon[1]++;
  }
  const setType = resolveSetType(formatStructure, setsWon, pointSet + 1);
  if (setType === 'tiebreakOnly' || setType === 'matchTiebreak') return true;
  if (setType !== 'standard') return false;

  const activeSetFormat =
    isLiveDecidingSet(formatStructure, setsWon, pointSet + 1) && formatStructure.finalSetFormat
      ? formatStructure.finalSetFormat
      : formatStructure.setFormat;
  if (!activeSetFormat || !setHasTiebreak(activeSetFormat)) return false;
  const tiebreakAt =
    typeof activeSetFormat.tiebreakAt === 'number' ? activeSetFormat.tiebreakAt : (activeSetFormat.setTo ?? 6);
  return pointGame === 2 * tiebreakAt;
}
