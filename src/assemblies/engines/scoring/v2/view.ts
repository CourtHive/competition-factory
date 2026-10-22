import { NEW_GAME, playGamePoint, playRacePoint } from './segments/game';
import { inTiebreak, standardSetWinner } from './segments/standard';
import { ruleForSet } from './format';
import { setsWon } from './decide';

// constants and types
import type { MatchRule, RaceRule, SegmentRule, StandardRule } from './format';
import type { GameInPlay, Pair, ScoredSet, ScoringState, Side } from './types';
import type { ServicePosition } from './service';

/**
 * The views a point carries (§ 11.2), computed before it from the score at the serve, for the format governing the
 * set in play: how many points (or games) each side must win in a row, the opponent scoring none, to win the game,
 * the set and the match; and whether the receiver is one point from the game (a break point).
 *
 * Every count is taken against the same predicate that completes the game, the set and the match, so No-Ad, deuce
 * caps, margins and completion rules agree with scoring. A timed segment, a combined total and outs have none.
 */

export type PointsTo = { pointsToGame: Pair; pointsToSet: Pair; pointsToMatch: Pair; gamesToSet: Pair };

/** a guard on every count: no rule here needs more points or games than this to finish */
const LIMIT = 200;

function raceNeeded(race: RaceRule, game: GameInPlay, side: Side): number {
  let current = game;
  for (let count = 1; count <= LIMIT; count += 1) {
    const played = playRacePoint(race, current, side);
    if (played.won) return count;
    current = played.game;
  }
  return -1;
}

function gameNeeded(rule: StandardRule, game: GameInPlay, side: Side): number {
  let current = game;
  for (let count = 1; count <= LIMIT; count += 1) {
    const played = playGamePoint(rule.game, current, side);
    if (played.won) return count;
    current = played.game;
  }
  return -1;
}

/** `pointsToGame` for one side (§ 11.2): a consecutive game needs the rest of its run, a race the rest of its points */
function pointsToGameFor(rule: SegmentRule, set: ScoredSet, game: GameInPlay | undefined, side: Side): number {
  const current = game ?? NEW_GAME;
  if (rule.kind === 'tiebreakOnly') return raceNeeded(rule.race, current, side);
  if (rule.kind !== 'standard') return -1;
  if (rule.tiebreak && inTiebreak(rule, set)) return raceNeeded(rule.tiebreak.race, current, side);
  return gameNeeded(rule, current, side);
}

/** `gamesToSet`: the games a side must win in a row to win the set, the game in play included */
function gamesToSetFor(rule: SegmentRule, set: ScoredSet, side: Side): number {
  if (rule.kind !== 'standard') return 1;
  const games: Pair = [set.side1Score, set.side2Score];
  for (let count = 1; count <= LIMIT; count += 1) {
    games[side] += 1;
    if (standardSetWinner(rule, games) === side) return count;
  }
  return -1;
}

/**
 * The fewest points that win a set of this rule from its start (§ 11.2: the remaining sets "at their minimum"): its
 * games, each at the fewest points that win a game of its format (four, or a consecutive game's run).
 */
function setMinimum(rule: SegmentRule): number {
  if (rule.kind === 'tiebreakOnly') return rule.race.to;
  if (rule.kind !== 'standard') return 0;
  const games = gamesToSetFor(rule, { setNumber: 0, side1Score: 0, side2Score: 0 }, 0);
  return games * gameNeeded(rule, NEW_GAME, 0);
}

/** `pointsToSet`: the game's points plus the remaining games at four points each; a race's points in a race */
function pointsToSetFor(rule: SegmentRule, toGame: number, toGames: number): number {
  if (rule.kind !== 'standard') return toGame;
  return toGame + (toGames - 1) * 4;
}

/** the points of the sets after the one in play that `side` must win in a row, each at its minimum */
function laterSets(match: MatchRule, set: { setNumber: number; won: Pair; side: Side; count: number }): number {
  let total = 0;
  const after: Pair = [...set.won];
  for (let k = 1; k <= set.count; k += 1) {
    after[set.side] += 1;
    total += setMinimum(ruleForSet(match, set.setNumber + k, after));
  }
  return total;
}

/**
 * `pointsToMatch` for one side (§ 11.2): by the match's completion rule. Best of N: the sets it still needs; exactly
 * N: every remaining set, and only when winning them all gives it more sets; an aggregate: its points, and only when
 * winning them all leaves it ahead (or level with a declared decider). A side that cannot win has `-1`.
 */
function pointsToMatchFor(position: ServicePosition, state: ScoringState, toSet: number, side: Side): number {
  const { match, set } = position;
  const before = state.sets.filter((other) => other !== set);
  const won = setsWon(before);
  const other = (1 - side) as Side;
  if (match.aggregate) return aggregateToMatch(position, before, toSet, side);
  if (match.mode === 'bestOf') {
    const needed = match.setsToWin - won[side] - 1;
    return toSet + laterSets(match, { setNumber: set.setNumber, won, side, count: Math.max(needed, 0) });
  }
  const remaining = match.n - set.setNumber;
  if (won[side] + 1 + remaining <= won[other]) return -1;
  return toSet + laterSets(match, { setNumber: set.setNumber, won, side, count: remaining });
}

/**
 * An aggregate of races (§ 9.3): winning out, the race in play's running points included, leaves the side's total
 * ahead, or level with a declared decider.
 */
function aggregateToMatch(position: ServicePosition, before: ScoredSet[], toSet: number, side: Side): number {
  const { match, set } = position;
  const units = (scored: ScoredSet): Pair => [
    scored.side1TiebreakScore ?? scored.side1Score,
    scored.side2TiebreakScore ?? scored.side2Score,
  ];
  const running = position.game?.score ?? [0, 0];
  const total = before.reduce<Pair>(
    (sum, scored) => {
      const [a, b] = units(scored);
      return [sum[0] + a, sum[1] + b];
    },
    [running[0], running[1]],
  );
  const remaining = Math.max(match.n - set.setNumber, 0);
  const later = laterSets(match, { setNumber: set.setNumber, won: setsWon(before), side, count: remaining });
  const lead = total[side] - total[1 - side] + toSet + later;
  if (lead > 0) return toSet + later;
  const decider = match.mode === 'exactly' && match.final;
  if (lead === 0 && decider) return toSet + later + setMinimum(match.final as SegmentRule);
  return -1;
}

/** whether points-to applies to the set in play: games or a race, not a timed segment, a combined total or outs */
function counted(rule: SegmentRule): boolean {
  return rule.kind === 'standard' || rule.kind === 'tiebreakOnly';
}

/** the points-to of the next point, or nothing where § 11.2 gives none */
export function pointsTo(state: ScoringState, position: ServicePosition): PointsTo | undefined {
  const { rule, set, game } = position;
  if (!counted(rule)) return undefined;
  const sides: Side[] = [0, 1];
  const toGame = sides.map((side) => pointsToGameFor(rule, set, game, side)) as Pair;
  const toGames = sides.map((side) => gamesToSetFor(rule, set, side)) as Pair;
  const toSet = sides.map((side) => pointsToSetFor(rule, toGame[side], toGames[side])) as Pair;
  const toMatch = sides.map((side) => pointsToMatchFor(position, state, toSet[side], side)) as Pair;
  return { pointsToGame: toGame, pointsToSet: toSet, pointsToMatch: toMatch, gamesToSet: toGames };
}

/**
 * A break point: the receiver needs one point to win the game (§ 11.2). Where the server is not known none is
 * produced, so it is false (§ 10.8, decision 17; reading SE2c-D2); a segment with no points-to has none at all.
 */
export function isBreakpoint(view: PointsTo | undefined, server: Side | undefined): boolean | undefined {
  if (!view) return undefined;
  return server !== undefined && view.pointsToGame[1 - server] === 1;
}
