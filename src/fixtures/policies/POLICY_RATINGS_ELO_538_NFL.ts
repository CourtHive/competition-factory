// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * FiveThirtyEight's NFL Elo ("How Our NFL Predictions Work", 2018, modified 2023): K 20, spread 400; K × ln(margin + 1)
 * × 2.2 / (winnerEloDiff × 0.001 + 2.2); a tie scores 0.5 each with K × 1.525 (2.2 ln 2). Not encoded: home field
 * (about 48 points), travel, rest after a bye, the quarterback adjustment, playoff scaling and season reversion (a
 * matchUp has no home side, and the rest are outside a result).
 */
export const POLICY_RATINGS_ELO_538_NFL = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'Elo, FiveThirtyEight NFL',
    source: 'FiveThirtyEight, "How Our NFL Predictions Work", 2018',
    expectation: { rule: 'LOGISTIC', base: 10, spread: 400 },
    k: { rule: 'CONSTANT', value: 20 },
    actual: { rule: 'WIN_LOSS' },
    margin: {
      rule: 'LOG_MOV_AUTOCORRECTED',
      scale: 1,
      offset: 1,
      intercept: 0,
      autocorrelation: 2.2,
      drawMultiplier: 1.525,
    },
    draws: 'RATE_AS_HALF',
  } satisfies RatingsPolicy,
};
