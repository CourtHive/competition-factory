import type { Pair, ScoredSet, SideNumber } from './types';
import type { MatchRule } from './format';

export type MatchDecision = { complete: boolean; winningSide?: SideNumber };

const IN_PLAY: MatchDecision = { complete: false };

/** sets won by each side */
export function setsWon(sets: ScoredSet[]): Pair {
  const won: Pair = [0, 0];
  for (const set of sets) if (set.winningSide) won[set.winningSide - 1] += 1;
  return won;
}

/** a set is closed once it has a winner (a timed segment closed level is SE2b's) */
export function isClosed(set: ScoredSet): boolean {
  return set.winningSide !== undefined;
}

function moreOf(pair: Pair): MatchDecision {
  if (pair[0] === pair[1]) return { complete: true };
  return { complete: true, winningSide: pair[0] > pair[1] ? 1 : 2 };
}

/** a segment's units toward an aggregate: a tiebreak-only segment's points (§ 9.3 rule 3) */
function units(set: ScoredSet): Pair {
  return [set.side1TiebreakScore ?? set.side1Score, set.side2TiebreakScore ?? set.side2Score];
}

/**
 * Aggregate (§ 9.3, § 9.4): all N segments played, then the total decides; sets won are not consulted. A level
 * total names no winner and completes the match (§ 9.7), unless exactly N declares a decider, set N + 1.
 */
function decideAggregate(match: MatchRule, sets: ScoredSet[]): MatchDecision {
  const counted = sets.slice(0, match.n);
  if (counted.length < match.n || !counted.every(isClosed)) return IN_PLAY;
  const total = counted.reduce<Pair>(
    (sum, set) => {
      const [a, b] = units(set);
      return [sum[0] + a, sum[1] + b];
    },
    [0, 0],
  );
  if (total[0] !== total[1]) return moreOf(total);
  const decides = match.mode === 'exactly' && !!match.final;
  if (!decides) return { complete: true };
  const decider = sets[match.n];
  if (!decider || !isClosed(decider)) return IN_PLAY;
  return { complete: true, winningSide: decider.winningSide };
}

/**
 * Whether the match is decided, and by whom (§ 9).
 *
 * - best of N: the first side to the majority of sets wins (§ 9.1); no set beyond N is played, so once all N
 *   are played the side with more wins, and a level count completes without a winner (§ 9.7);
 * - exactly N, not aggregate: a lead is not a win; once all N are played the side with more sets wins, and a
 *   level count completes without a winner (§ 9.2);
 * - aggregate: § 9.3, § 9.4.
 */
export function decideMatch(match: MatchRule, sets: ScoredSet[]): MatchDecision {
  if (match.aggregate) return decideAggregate(match, sets);
  const won = setsWon(sets);
  if (match.mode === 'bestOf') {
    if (won[0] >= match.setsToWin) return { complete: true, winningSide: 1 };
    if (won[1] >= match.setsToWin) return { complete: true, winningSide: 2 };
  }
  const played = sets.filter(isClosed).length;
  return played >= match.n ? moreOf(won) : IN_PLAY;
}
