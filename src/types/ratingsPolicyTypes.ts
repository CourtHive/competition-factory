// Ratings policy — how a dynamic rating moves on a result, attached via POLICY_TYPE_RATINGS.
// Every rule encodes a published method; the policy's `source` names it (Mentat planning/RATINGS_POLICY_PLAN.md).
import type { ExpectationRule } from '@Generators/scales/ratingUpdate';

export type RatingsKRule =
  /** one K for both sides: the update is zero-sum */
  | { rule: 'CONSTANT'; value: number }
  /**
   * FiveThirtyEight's tennis K, `numerator / (m + offset)^shape`, m the player's career matches played before this one.
   * The factory holds no career history, so the caller passes `matchesPlayed`; without it the rating is refused.
   */
  | { rule: 'MATCHES_PLAYED'; numerator: number; offset: number; shape: number };

export type RatingsActualRule =
  /** 1 for a win, 0 for a loss */
  | { rule: 'WIN_LOSS' }
  /**
   * Huang 2014: a best-of-3 win in 2 sets is 1 and in 3 is 2/3; a best-of-5 win in 3, 4 and 5 sets is 1, 0.8 and 0.6.
   * The loser takes the complement. Any other format is rated as WIN_LOSS.
   */
  | { rule: 'SETS_PLAYED_SHARE' };

export type RatingsPolicy = {
  policyName: string;
  /** the published method the policy encodes */
  source: string;
  expectation: ExpectationRule;
  k: RatingsKRule;
  actual: RatingsActualRule;
  /** a WALKOVER: rated as a win (Huang 2014: a straight-sets win), or not rated. Default RATE_AS_WIN */
  walkovers?: 'RATE_AS_WIN' | 'EXCLUDE';
};
