// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * World Football Elo Ratings (eloratings.net, "About"): Rn = Ro + K × (W − We), spread 400; K 30 for "all other
 * tournaments" (60 World Cup finals, 50 continental finals, 40 qualifiers, 20 friendlies: set them in `kByTier`); K
 * raised by the goal difference; a draw 0.5; an extra-time result a normal result. Not encoded: the +100 home advantage
 * (a matchUp has no home side). The source publishes no shootout rule, so a shootout win is the recorded win.
 */
export const POLICY_RATINGS_ELO_WORLD_FOOTBALL = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'World Football Elo',
    source: 'World Football Elo Ratings, eloratings.net, "About"',
    expectation: { rule: 'LOGISTIC', base: 10, spread: 400 },
    k: { rule: 'CONSTANT', value: 30 },
    actual: { rule: 'WIN_LOSS' },
    margin: { rule: 'GOAL_DIFFERENCE_STEPS' },
    draws: 'RATE_AS_HALF',
  } satisfies RatingsPolicy,
};
