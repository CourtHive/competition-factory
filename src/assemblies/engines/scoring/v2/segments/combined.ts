import { NEW_GAME } from './game';

// constants and types
import type { GameInPlay, Pair, ScoredSet, Side } from '../types';
import type { SegmentPoint } from './segment';
import type { CombinedRule } from '../format';

/**
 * The combined total (§ 7): one segment of rallies, ending when both sides' points total n.
 *
 * 2. below n it is open; at n an unequal result is complete with a winner, under every variant;
 * 3. a tie at n (only an even n ties): `P{n}` completes without a winner; `P{n}DP` takes one deciding rally;
 *    `P{n}WB{m}` plays on until a lead of m.
 */
export function combinedClosed(rule: CombinedRule, [a, b]: Pair): boolean {
  const played = a + b;
  if (played < rule.total) return false;
  if (played === rule.total) return a !== b || rule.tie === 'ALLOW';
  if (rule.tie === 'DECIDING_POINT') return true;
  return Math.abs(a - b) >= rule.margin;
}

/** a total no play can reach (§ 7): above n only from an even tie, one rally past it for DP, never past a lead of m */
export function combinedReachable(rule: CombinedRule, [a, b]: Pair): boolean {
  const played = a + b;
  if (played <= rule.total) return true;
  const half = rule.total / 2;
  if (rule.tie === 'ALLOW' || !Number.isInteger(half) || a < half || b < half) return false;
  if (rule.tie === 'DECIDING_POINT') return played === rule.total + 1;
  return Math.abs(a - b) <= rule.margin;
}

/**
 * The set as a combined total leaves it: closed with the side ahead as its winner. A tie at the total closes it with
 * none, which the set does not mark (`segmentComplete` is a timed segment's, § 1.2): completion reads the rule.
 */
export function combinedSet(rule: CombinedRule, set: ScoredSet): ScoredSet {
  const scores: Pair = [set.side1Score, set.side2Score];
  if (!combinedClosed(rule, scores) || scores[0] === scores[1]) return set;
  return { ...set, winningSide: scores[0] > scores[1] ? 1 : 2 };
}

/** a rally adds one point to its winner (§ 7 rule 1); the game score reported is the segment's */
export function combinedPoint(
  rule: CombinedRule,
  set: ScoredSet,
  game: GameInPlay | undefined,
  winner: Side,
): SegmentPoint {
  const before = game ?? NEW_GAME;
  const scores: Pair = [set.side1Score, set.side2Score];
  scores[winner] += 1;
  const next = combinedSet(rule, { ...set, side1Score: scores[0], side2Score: scores[1] });
  const coordinates = { game: 0, number: before.pointsPlayed };
  const played = { score: scores, pointsPlayed: before.pointsPlayed + 1 };
  const done = combinedClosed(rule, scores);
  return { set: next, game: done ? undefined : played, coordinates, score: `${scores[0]}-${scores[1]}` };
}
