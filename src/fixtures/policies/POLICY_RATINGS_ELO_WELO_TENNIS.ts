// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * Weighted Elo (Angelini, Candila & De Angelis, "Weighted Elo rating for tennis match predictions", EJOR 297(1), 2022):
 * E + K × (W − p) × f, f the winner's share of the games for both players; K FiveThirtyEight's by career matches played,
 * so the caller passes `matchesPlayed`. A tiebreak-only set counts one game to its winner.
 */
export const POLICY_RATINGS_ELO_WELO_TENNIS = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'Weighted Elo (WElo), tennis',
    source: 'Angelini, Candila & De Angelis, "Weighted Elo rating for tennis match predictions", EJOR 297(1), 2022',
    expectation: { rule: 'LOGISTIC', base: 10, spread: 400 },
    k: { rule: 'MATCHES_PLAYED', numerator: 250, offset: 5, shape: 0.4 },
    actual: { rule: 'WIN_LOSS' },
    margin: { rule: 'WINNER_GAME_SHARE' },
  } satisfies RatingsPolicy,
};
