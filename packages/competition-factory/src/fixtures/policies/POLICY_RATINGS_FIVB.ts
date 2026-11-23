// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * FIVB Volleyball World Ranking ("How it works", "Examples", FIVB): on the FIVB scale, points = (SSV − EMR) × MWF / 8.
 * The expected match result (EMR) sums each set result's value (3-0 +2, 3-1 +1.5, 3-2 +1, 2-3 −1, 1-3 −1.5, 0-3 −2)
 * by its probability: Φ at the cut-points −1.060, −0.394, 0, 0.394, 1.060, shifted by 8 × the score gap / 1000. A
 * winner cannot lose points: it gains 0.01 instead. K 6.25 is the Olympic Games and World Championship weight (MWF 50 /
 * 8); set the others in `kByTier` (VNL and continental championships 40, annual continental events 30, zonal 20, each
 * divided by 8). Every match is neutral. Rate it with `ratingType: 'FIVB'`.
 */
export const POLICY_RATINGS_FIVB = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'FIVB Volleyball World Ranking',
    source: 'FIVB, "Volleyball World Ranking for Senior National Teams: How it works" and "Examples"',
    expectation: {
      rule: 'ORDERED_PROBIT',
      scale: 0.008,
      cutPoints: [-1.06, -0.394, 0, 0.394, 1.06],
      resultValues: [2, 1.5, 1, -1, -1.5, -2],
    },
    k: { rule: 'CONSTANT', value: 6.25 },
    actual: { rule: 'SET_SCORE_VALUE', values: { '3-0': 2, '3-1': 1.5, '3-2': 1, '2-3': -1, '1-3': -1.5, '0-3': -2 } },
    winnerMinimumGain: 0.01,
  } satisfies RatingsPolicy,
};
