import { ratingsPolicies } from '@Fixtures/policies/ratingsPolicies';
import { matchesPlayedK } from './ratingUpdate';

// types
import type { RatingsActualRule, RatingsKRule, RatingsMarginRule, RatingsPolicy } from '@Types/ratingsPolicyTypes';
import type { ParsedFormat } from '@Helpers/matchUpFormatCode/parse';
import type { TierClassification } from '@Types/tournamentTypes';

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

/** The K multiplier a margin rule gives; 1 where the rule has no margin to read. */
export function marginMultiplier({
  rule,
  marginOfVictory,
  winnerGameShare,
  winnerEloDiff = 0,
  draw,
}: {
  rule?: RatingsMarginRule;
  marginOfVictory?: number;
  winnerGameShare?: number;
  winnerEloDiff?: number;
  draw?: boolean;
}): number {
  if (!rule) return 1;
  if (rule.rule === 'WINNER_GAME_SHARE') return winnerGameShare ?? 1;
  if (draw && rule.rule === 'LOG_MOV_AUTOCORRECTED' && rule.drawMultiplier !== undefined) return rule.drawMultiplier;
  if (!marginOfVictory || marginOfVictory < 1) return 1;
  if (rule.rule === 'POWER_MOV_AUTOCORRECTED') {
    const { offset, power, intercept, slope } = rule;
    return Math.pow(marginOfVictory + offset, power) / (intercept + slope * winnerEloDiff);
  }
  if (rule.rule === 'GOAL_DIFFERENCE_STEPS') {
    if (marginOfVictory === 1) return 1;
    if (marginOfVictory === 2) return 1.5;
    return (11 + marginOfVictory) / 8;
  }
  const { scale, offset, intercept, autocorrelation } = rule;
  const mov = scale * Math.log(marginOfVictory + offset) + intercept;
  return (mov * autocorrelation) / (winnerEloDiff * 0.001 + autocorrelation);
}

/** K for a tournament or event tier, keyed `system:value`: the event's tier first, then the tournament's. */
export function tierK(kByTier: Record<string, number> | undefined, tiers: (TierClassification | undefined)[]) {
  if (!kByTier) return undefined;
  for (const tier of tiers) {
    const k = tier && kByTier[`${tier.system}:${tier.value}`];
    if (k !== undefined) return k;
  }
  return undefined;
}

/** An inline ratings policy names the three parts every rating reads. */
export function isRatingsPolicy(policy?: RatingsPolicy): policy is RatingsPolicy {
  return !!policy?.expectation && !!policy?.k && !!policy?.actual;
}

/** A ratings policy selected by preset name or given inline; `undefined` for an unknown name or an incomplete policy. */
export function resolveRatingsPolicy(selected: string | RatingsPolicy): RatingsPolicy | undefined {
  const policy = typeof selected === 'string' ? ratingsPolicies[selected] : selected;
  return isRatingsPolicy(policy) ? policy : undefined;
}
