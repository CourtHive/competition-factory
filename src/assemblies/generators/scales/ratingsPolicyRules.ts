import { matchesPlayedK } from './ratingUpdate';

// types
import type { RatingsActualRule, RatingsKRule } from '@Types/ratingsPolicyTypes';
import type { ParsedFormat } from '@Helpers/matchUpFormatCode/parse';

/** A side's K under the policy; `undefined` where MATCHES_PLAYED has no career count to read. */
export function kOf(rule: RatingsKRule, matchesPlayed?: number): number | undefined {
  if (rule.rule === 'CONSTANT') return rule.value;
  if (matchesPlayed === undefined) return undefined;
  const { numerator, offset, shape } = rule;
  return matchesPlayedK({ matchesPlayed, numerator, offset, shape });
}

// Huang 2014's actual result for the winner, by best-of count and the sets the loser won
const SETS_PLAYED_SHARE: Record<number, number[]> = {
  3: [1, 2 / 3],
  5: [1, 0.8, 0.6],
};

/** The winner's actual result (the loser's is its complement). */
export function winnerActualOf({
  rule,
  parsedFormat,
  loserSetsWon,
}: {
  rule: RatingsActualRule;
  parsedFormat?: ParsedFormat;
  loserSetsWon: number;
}): number {
  if (rule.rule !== 'SETS_PLAYED_SHARE' || parsedFormat?.exactly !== undefined || parsedFormat?.aggregate) return 1;
  return SETS_PLAYED_SHARE[parsedFormat?.bestOf ?? 0]?.[loserSetsWon] ?? 1;
}
