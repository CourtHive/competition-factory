// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * FIFA/Coca-Cola Women's World Ranking ("Women's ranking procedures", FIFA, April 2023): P_after = P_before + K ×
 * (R_actual − R_expected). R_actual from FIFA's table by the non-winner's goals and the goal difference (a draw
 * 0.47 to 0.53 each, rising with the goals). K 15 is the base for a friendly; the importance multipliers (×2 to ×4:
 * 30, 45, 60) go in `kByTier`. FIFA publishes the expectation as a table (+100 → 64 %, +200 → 76 %, +300 → 85 %), not
 * its scaling factor; spread 400 reproduces it. Not encoded: the 100-point home advantage (a matchUp has no home side).
 */
export const POLICY_RATINGS_FIFA_WOMEN = {
  [POLICY_TYPE_RATINGS]: {
    policyName: "FIFA Women's World Ranking",
    source: 'FIFA, "Women\'s ranking procedures", April 2023',
    expectation: { rule: 'LOGISTIC', base: 10, spread: 400 },
    k: { rule: 'CONSTANT', value: 15 },
    actual: {
      rule: 'GOAL_TABLE',
      // rows: the non-winner's goals 0, 1, 2, 3, 4, 5+; columns: goal difference 0, 1, 2, 3, 4, 5, 6+
      table: [
        [0.47, 0.15, 0.08, 0.04, 0.03, 0.02, 0.01],
        [0.5, 0.16, 0.089, 0.048, 0.037, 0.026, 0.015],
        [0.51, 0.17, 0.098, 0.056, 0.044, 0.032, 0.02],
        [0.52, 0.18, 0.107, 0.064, 0.051, 0.038, 0.025],
        [0.525, 0.19, 0.116, 0.072, 0.058, 0.044, 0.03],
        [0.53, 0.2, 0.125, 0.08, 0.065, 0.05, 0.035],
      ],
    },
    draws: 'RATE_AS_HALF',
  } satisfies RatingsPolicy,
};
