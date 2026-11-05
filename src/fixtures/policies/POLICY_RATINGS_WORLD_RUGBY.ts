// Constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';

// types
import type { RatingsPolicy } from '@Types/ratingsPolicyTypes';

/**
 * World Rugby Rankings ("Rankings Explanation", World Rugby): a points exchange on the WORLD_RUGBY scale. The core
 * change is 1 − gap/10 for a win, −gap/10 for a draw and −1 − gap/10 for a loss, the gap clamped to ±10, so a side
 * cannot win points for losing or lose them for winning: K 2 with an expectation of 0.5 + gap/20. × 1.5 for a win by
 * more than 15 points; × 2 at a Rugby World Cup (set it in `kByTier`). Not encoded: the 3-point home advantage (a
 * matchUp has no home side). Rate it with `ratingType: 'WORLD_RUGBY'`.
 */
export const POLICY_RATINGS_WORLD_RUGBY = {
  [POLICY_TYPE_RATINGS]: {
    policyName: 'World Rugby Rankings',
    source: 'World Rugby, "Rankings Explanation"',
    expectation: { rule: 'LINEAR', slope: 0.05, cap: 10 },
    k: { rule: 'CONSTANT', value: 2 },
    actual: { rule: 'WIN_LOSS' },
    margin: { rule: 'THRESHOLD', above: 15, multiplier: 1.5 },
    draws: 'RATE_AS_HALF',
  } satisfies RatingsPolicy,
};
