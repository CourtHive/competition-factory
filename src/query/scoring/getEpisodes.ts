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

import type { MatchUp, Episode, EpisodeNeeded } from '@Types/scoring/types';

export function getEpisodes(matchUp: MatchUp): Episode[] {
  if (!matchUp) return [];
  const points = matchUp.history?.points;
  if (!points || points.length === 0) return [];

  const episodes: Episode[] = [];

  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    const nextPoint = i < points.length - 1 ? points[i + 1] : undefined;
    const isLastPoint = i === points.length - 1;
    const isCompleted = matchUp.matchUpStatus === 'COMPLETED';

    const pointSet = (point as any).set ?? 0;
    const pointGame = (point as any).game ?? 0;
    const pointNumber = (point as any).number ?? 0;

    const { gameComplete, setComplete } = detectBoundaries({
      nextPoint,
      isLastPoint,
      isCompleted,
      pointSet,
      pointGame,
    });

    const gameWinner: 0 | 1 | undefined = gameComplete ? point.winner : undefined;
    const setWinner = resolveSetWinner(setComplete, matchUp, pointSet);
    const needed = buildNeeded(point);
    const nextService = nextPoint?.server ?? point.server ?? 0;
    const isTiebreak = detectTiebreak(matchUp, pointSet, pointGame);

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
      complete: isLastPoint && isCompleted,
    });
  }

  return episodes;
}

function detectBoundaries({ nextPoint, isLastPoint, isCompleted, pointSet, pointGame }) {
  const nextSet = nextPoint ? ((nextPoint as any).set ?? 0) : undefined;
  const nextGame = nextPoint ? ((nextPoint as any).game ?? 0) : undefined;

  const gameComplete = isLastPoint
    ? isCompleted || (nextSet === undefined && nextGame === undefined)
    : nextSet !== pointSet || nextGame !== pointGame;

  const setComplete = isLastPoint ? isCompleted || false : nextPoint !== undefined && nextSet !== pointSet;

  return { gameComplete, setComplete };
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

function detectTiebreak(matchUp: MatchUp, pointSet: number, pointGame: number): boolean {
  const currentSetObj = matchUp.score.sets[pointSet];
  return !!(
    currentSetObj?.isTiebreakOnly ||
    (pointGame > 0 &&
      currentSetObj &&
      currentSetObj.side1Score !== undefined &&
      currentSetObj.side2Score !== undefined &&
      !currentSetObj.isTiebreakOnly)
  );
}
