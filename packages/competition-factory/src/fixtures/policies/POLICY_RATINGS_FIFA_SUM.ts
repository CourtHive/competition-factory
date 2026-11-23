// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * FIFA/Coca-Cola Men's World Ranking, "SUM" (FIFA, "Revision of the FIFA / Coca-Cola World Ranking", 2018):
 * P = Pbefore + I × (W − We), We = 1 / (10^(−dr/600) + 1); a draw 0.5; a shootout won 0.75 and lost 0.5; extra time a
 * normal result; no goal margin; in the knock-out rounds of a final competition a negative result leaves the rating
 * unchanged. I by competition (5 to 60) goes in `kByTier`; K 10 is FIFA's I for a friendly inside the international
 * match calendar windows, the base for a matchUp no tier matches.
 */
export const POLICY_RATINGS_FIFA_SUM = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'FIFA SUM',
    source: 'FIFA, "Revision of the FIFA / Coca-Cola World Ranking", 2018',
    expectation: { rule: 'LOGISTIC', base: 10, spread: 600 },
    k: { rule: 'CONSTANT', value: 10 },
    actual: { rule: 'WIN_LOSS' },
    shootoutResult: { rule: 'PARTIAL', winner: 0.75, loser: 0.5 },
    protections: ['KNOCKOUT_LOSS_PROTECTION'],
    draws: 'RATE_AS_HALF',
  } satisfies RatingsPolicy,
};
