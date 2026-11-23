// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * FiveThirtyEight's NBA Elo ("How We Calculate NBA Elo Ratings", Silver and Fischer-Baum, 2015): K 20, spread 400;
 * K × (margin + 3)^0.8 / (7.5 + 0.006 × winnerEloDiff), the Elo difference signed from the winner's side. Not encoded:
 * the 100-point home-court advantage (a matchUp has no home side) and the season reversion toward 1505.
 */
export const POLICY_RATINGS_ELO_538_NBA = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'Elo, FiveThirtyEight NBA',
    source: 'FiveThirtyEight, "How We Calculate NBA Elo Ratings", 2015',
    expectation: { rule: 'LOGISTIC', base: 10, spread: 400 },
    k: { rule: 'CONSTANT', value: 20 },
    actual: { rule: 'WIN_LOSS' },
    margin: { rule: 'POWER_MOV_AUTOCORRECTED', offset: 3, power: 0.8, intercept: 7.5, slope: 0.006 },
  } satisfies RatingsPolicy,
};
