import { tiebreakOnlyGame, tiebreakOnlyPoint, tiebreakOnlyTotalWinner } from './tiebreakOnly';
import { standardGame, standardPoint, standardSetWinner } from './standard';

// constants and types
import type { GameInPlay, Pair, ScoredSet, Side } from '../types';
import type { SegmentRule } from '../format';

/** what a point did to the open set: the set and game after it, its coordinates (§ 11.1) and its game score */
export type SegmentPoint = {
  set: ScoredSet;
  game: GameInPlay | undefined;
  coordinates: { game: number; number: number };
  score: string;
};

/** one place that says which segment kinds SE2a scores; the others are SE2b's (timed, combined, outs) */
function unsupported(rule: SegmentRule): never {
  throw new Error(`scoring v2 (SE2a) does not score ${rule.kind} segments`);
}

/** a new set of the kind its rule declares */
export function openSet(rule: SegmentRule, setNumber: number): ScoredSet {
  return {
    setNumber,
    side1Score: 0,
    side2Score: 0,
    ...(rule.kind === 'tiebreakOnly' ? { isTiebreakOnly: true } : {}),
  };
}

export function segmentPoint(
  rule: SegmentRule,
  set: ScoredSet,
  game: GameInPlay | undefined,
  winner: Side,
  value: number,
): SegmentPoint {
  if (rule.kind === 'standard') return standardPoint(rule, set, game, winner);
  if (rule.kind === 'tiebreakOnly') return tiebreakOnlyPoint(rule, set, game, winner, value);
  return unsupported(rule);
}

export function segmentGame(
  rule: SegmentRule,
  set: ScoredSet,
  winner: Side,
  tiebreakScore?: Pair,
): { set: ScoredSet; game?: GameInPlay } | { refused: string } {
  if (rule.kind === 'standard') return standardGame(rule, set, winner, tiebreakScore);
  if (rule.kind === 'tiebreakOnly') return tiebreakOnlyGame(rule, set, winner, tiebreakScore);
  return unsupported(rule);
}

/** the side a set total is won by under its segment's rule, if the rule calls it finished (§ 2.3) */
export function segmentTotalWinner(rule: SegmentRule, totals: Pair, tiebreakPoints?: Pair): Side | undefined {
  if (rule.kind === 'standard') return standardSetWinner(rule, totals);
  if (rule.kind === 'tiebreakOnly') return tiebreakOnlyTotalWinner(rule, totals, tiebreakPoints);
  return unsupported(rule);
}

/** whether a point's value counts: only in a segment scored in units (§ 4.4, § 5 rule 5) */
export function pointsAreUnits(rule: SegmentRule): boolean {
  return rule.kind === 'tiebreakOnly';
}
