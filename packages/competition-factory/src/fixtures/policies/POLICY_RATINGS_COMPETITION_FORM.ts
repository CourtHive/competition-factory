// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * The DrawMatic and Swiss competition policies' dynamic form rating as a ratings policy: one K of 24 for both sides,
 * spread 400, the actual result the share of the points (else games) won, as UTR rates on the share of games won. It is
 * the fallback for a competition policy whose dynamicFormRating names no ratings policy.
 */
export const POLICY_RATINGS_COMPETITION_FORM = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'Competition form rating',
    source: 'factory competition policies (POLICY_COMPETITION_*): dynamic form rating; UTR, share of games won',
    expectation: { rule: 'LOGISTIC', base: 10, spread: 400 },
    k: { rule: 'CONSTANT', value: 24 },
    actual: { rule: 'SCORE_SHARE' },
  } satisfies RatingsPolicy,
};
