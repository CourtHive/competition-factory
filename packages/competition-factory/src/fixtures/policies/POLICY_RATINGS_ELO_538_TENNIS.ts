// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * FiveThirtyEight's tennis Elo, as Kovalchik 2016 describes it ("Searching for the GOAT of tennis win prediction",
 * J. Quant. Anal. Sports 12(3)): K = 250 / (m + 5)^0.4, m the player's career matches played, and a plain win or
 * loss. Each player's K differs, so the update is not zero-sum. The source's ×1.1 at Grand Slams needs an event level
 * and is not applied. The caller passes each player's career count (`matchesPlayed`); the factory holds no such history.
 */
export const POLICY_RATINGS_ELO_538_TENNIS = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'Elo, FiveThirtyEight tennis',
    source: 'S. Kovalchik, "Searching for the GOAT of tennis win prediction", J. Quant. Anal. Sports 12(3), 2016',
    expectation: { rule: 'LOGISTIC', base: 10, spread: 400 },
    k: { rule: 'MATCHES_PLAYED', numerator: 250, offset: 5, shape: 0.4 },
    actual: { rule: 'WIN_LOSS' },
  } satisfies RatingsPolicy,
};
