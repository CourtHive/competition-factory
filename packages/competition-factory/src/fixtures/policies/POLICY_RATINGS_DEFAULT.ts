// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * The default for `generateDynamicRatings` (CA 2026-11-05). Huang 2014, "Elo Ratings and the ATP" (Berkeley STAT 157):
 * one K for both players, so the update is zero-sum; the actual result by sets played; a walkover rated as a
 * straight-sets win. Huang's K is 30 at Grand Slams and 20 at Masters 1000; with no event level to read, this uses the
 * paper's own flat-K run, K = 25.
 */
export const POLICY_RATINGS_DEFAULT = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'Elo, Huang 2014 (flat K)',
    source: 'J. Huang, "Elo Ratings and the ATP", Berkeley STAT 157, 2014',
    expectation: { rule: 'LOGISTIC', base: 10, spread: 400 },
    k: { rule: 'CONSTANT', value: 25 },
    actual: { rule: 'SETS_PLAYED_SHARE' },
    walkovers: 'RATE_AS_WIN',
  } satisfies RatingsPolicy,
};
