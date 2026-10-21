import { positionOf, serverOf } from './reduce';
import { combinedClosed } from './segments/combined';
import { inTiebreak } from './segments/standard';
import { atTimeIn } from './segments/segment';
import { isClosed } from './decide';
import { pointsTo } from './view';

// constants and types
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import type { PointSituation, ScoreResult, SetScore } from '@Types/scoring/types';
import type { CombinedRule, SegmentRule } from './format';
import type { ServicePosition } from './service';
import type { ReducerContext } from './reduce';
import type { Pair, ScoringState, Side } from './types';

/**
 * ScoringEngine v2 (SE2c): the score as `getScore()` reports it (§ 11.2, § 11.3), read from the reduced state.
 *
 * The rule-bearing parts (the situation: points-to, server, tiebreak, golden point; and `decisionRequired`) are the
 * reducer's own views (`view.ts`, `service.ts`). The display parts follow the API's conventions: the score string
 * joins the sets, a set with a tiebreak showing the loser's tiebreak points (`7-6(3)`); `games` and `points` are the
 * set in play's games and the game in play's points; `pointDisplay` shows tennis calls in a traditional game and
 * numbers everywhere else.
 */

const CALLS = ['0', '15', '30', '40'];

function setString(set: SetScore): string {
  const s1 = set.side1Score ?? 0;
  const s2 = set.side2Score ?? 0;
  if (set.side1TiebreakScore === undefined && set.side2TiebreakScore === undefined) return `${s1}-${s2}`;
  const tb1 = set.side1TiebreakScore ?? 0;
  const tb2 = set.side2TiebreakScore ?? 0;
  return s1 > s2 ? `${s1}-${s2}(${tb2})` : `${s1}(${tb1})-${s2}`;
}

export function scoreString(sets: SetScore[]): string {
  return sets.length ? sets.map(setString).join(', ') : '0-0';
}

/** whether the next point is a tiebreak's: a tiebreak-only set, a set tiebreak, or the tiebreak at time (§ 11.2) */
function inATiebreak(position: ServicePosition): boolean {
  const { rule, set } = position;
  if (rule.kind === 'tiebreakOnly') return true;
  if (rule.kind === 'standard') return !!rule.tiebreak && inTiebreak(rule, set);
  return atTimeIn(rule, set);
}

/** whether the game in play is a traditional game, shown in tennis calls */
function traditionalGame(position: ServicePosition): boolean {
  const { rule } = position;
  if (inATiebreak(position)) return false;
  if (rule.kind === 'standard') return rule.game.kind === 'traditional';
  return rule.kind === 'timed' && rule.buildsGames && rule.game.kind === 'traditional';
}

function tennisCalls([a, b]: Pair): [string, string] {
  if (a >= 3 && b >= 3) {
    if (a === b) return ['40', '40'];
    return a > b ? ['A', '40'] : ['40', 'A'];
  }
  return [CALLS[a] ?? String(a), CALLS[b] ?? String(b)];
}

const NO_FLAGS = {
  isBreakPoint: false,
  isGamePoint: false,
  isSetPoint: false,
  isMatchPoint: false,
  isGoldenPoint: false,
  isTiebreak: false,
};

/** a combined total (§ 11.2): a match point is a rally that would complete it with a winner; golden is the DP rally */
function combinedSituation(rule: CombinedRule, position: ServicePosition): Partial<PointSituation> {
  const scores: Pair = [position.set.side1Score, position.set.side2Score];
  const wins = (side: Side) => {
    const after: Pair = [...scores];
    after[side] += 1;
    return combinedClosed(rule, after) && after[side] > after[1 - side];
  };
  const both = wins(0) && wins(1);
  return { isMatchPoint: wins(0) || wins(1), isGoldenPoint: both && rule.tie === 'DECIDING_POINT' };
}

function ruledSituation(state: ScoringState, position: ServicePosition, known: Side | undefined) {
  const view = pointsTo(state, position);
  const { rule } = position;
  if (rule.kind === 'combined') return combinedSituation(rule, position);
  if (!view) return {};
  const [toGame0, toGame1] = view.pointsToGame;
  const consecutive = rule.kind === 'standard' && rule.game.kind === 'consecutive' && !inATiebreak(position);
  return {
    isBreakPoint: known !== undefined && view.pointsToGame[1 - known] === 1,
    isGamePoint: known !== undefined && view.pointsToGame[known] === 1,
    isSetPoint: Math.min(...view.pointsToSet) === 1,
    isMatchPoint: view.pointsToMatch.includes(1),
    isGoldenPoint: toGame0 === 1 && toGame1 === 1 && !consecutive,
    isTiebreak: inATiebreak(position),
  };
}

/** the situation of the next point (§ 11.2): none before the first input or after a decided match */
export function situationOf(context: ReducerContext, state: ScoringState): PointSituation | undefined {
  if (state.matchUpStatus === COMPLETED && !state.winningSide) return { ...NO_FLAGS, decisionRequired: true };
  if (state.matchUpStatus === COMPLETED || state.matchUpStatus === TO_BE_PLAYED || !context.match) return undefined;
  const position = positionOf(context.match, state);
  const next = serverOf(context, state);
  const known = next.derived ? next.side : undefined;
  return { ...NO_FLAGS, ...ruledSituation(state, position, known), server: next.side, serverDerived: next.derived };
}

/** the set in play's games and the game in play's points, and how the game in play is shown */
function inPlay(context: ReducerContext, state: ScoringState) {
  const last = state.sets.at(-1);
  // a combined total is one segment of rallies: its points are the totals, and it has no games (§ 7)
  if (context.match && positionOf(context.match, state).rule.kind === 'combined') {
    const totals: Pair = last ? [last.side1Score, last.side2Score] : [0, 0];
    const live = state.matchUpStatus !== COMPLETED && !!last;
    const pointDisplay: [string, string] | undefined = live ? [String(totals[0]), String(totals[1])] : undefined;
    return { games: [0, 0], points: totals, pointDisplay };
  }
  const open = !!last && !isClosed(last) && !last.winningSide;
  const games: number[] = open ? [last.side1Score, last.side2Score] : [0, 0];
  const points: Pair = state.game ? [...state.game.score] : [0, 0];
  if (!open || !context.match || state.matchUpStatus === COMPLETED) return { games, points };
  const position = positionOf(context.match, state);
  const shown: [string, string] = traditionalGame(position)
    ? tennisCalls(points)
    : [String(points[0]), String(points[1])];
  return { games, points, pointDisplay: shown };
}

export function scoreOf(context: ReducerContext, state: ScoringState, sets: SetScore[]): ScoreResult {
  const { games, points, pointDisplay } = inPlay(context, state);
  return {
    sets,
    scoreString: scoreString(sets),
    games,
    points,
    pointDisplay,
    situation: situationOf(context, state),
    decisionRequired: state.matchUpStatus === COMPLETED && !state.winningSide,
  };
}

/** the governing rule of the set in play, for the input levels (§ 3.3) */
export function ruleInPlay(context: ReducerContext, state: ScoringState): SegmentRule | undefined {
  return context.match && positionOf(context.match, state).rule;
}
