// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * FiveThirtyEight's NHL Elo ("How Our NHL Predictions Work", 2021): K 6, spread 400; K × (0.6686 ln(margin) + 0.8048)
 * × 2.05 / (winnerEloDiff × 0.001 + 2.05); an overtime or shootout win a full win by one goal (no predictive gain from
 * telling them apart). Not encoded: the +50 home-ice advantage (a matchUp has no home side), playoff scaling, and the
 * 30% reversion between seasons.
 */
export const POLICY_RATINGS_ELO_538_NHL = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'Elo, FiveThirtyEight NHL',
    source: 'FiveThirtyEight, "How Our NHL Predictions Work", 2021',
    expectation: { rule: 'LOGISTIC', base: 10, spread: 400 },
    k: { rule: 'CONSTANT', value: 6 },
    actual: { rule: 'WIN_LOSS' },
    margin: { rule: 'LOG_MOV_AUTOCORRECTED', scale: 0.6686, offset: 0, intercept: 0.8048, autocorrelation: 2.05 },
    overtimeResult: { rule: 'FULL_RESULT', margin: 1 },
    shootoutResult: { rule: 'FULL_RESULT', margin: 1 },
  } satisfies RatingsPolicy,
};
