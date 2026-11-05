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
  | { rule: 'SETS_PLAYED_SHARE' }
  /**
   * The share of the scoring units won: points, else games, else sets (UTR rates on the share of games won; the
   * competition policy's POINT_SHARE). A draw can be other than 0.5.
   */
  | { rule: 'SCORE_SHARE' }
  /**
   * FIVB: the value of the result in sets, keyed by sets won and lost ('3-0': 2, '3-1': 1.5, '3-2': 1, '2-3': -1,
   * '1-3': -1.5, '0-3': -2), compared with the ORDERED_PROBIT expectation's value. A result with no value is not rated.
   */
  | { rule: 'SET_SCORE_VALUE'; values: Record<string, number> };

export type RatingsMarginRule =
  /**
   * World Football Elo (eloratings.net): K × 1 for a draw or a one-goal win, × 1.5 for two goals, × 1.75 for three,
   * × (11 + N) / 8 for N ≥ 4.
   */
  | { rule: 'GOAL_DIFFERENCE_STEPS' }
  /**
   * FiveThirtyEight's NHL and NFL Elo: K × (scale · ln(margin + offset) + intercept) × autocorrelation /
   * (winnerEloDiff × 0.001 + autocorrelation). NHL: scale 0.6686, offset 0, intercept 0.8048, autocorrelation 2.05.
   * A level result has no margin and takes × 1.
   */
  | {
      rule: 'LOG_MOV_AUTOCORRECTED';
      scale: number;
      offset: number;
      intercept: number;
      autocorrelation: number;
      /** FiveThirtyEight NFL: a tie takes 1.525 (2.2 ln 2); unset, a level result takes × 1 */
      drawMultiplier?: number;
    }
  /**
   * FiveThirtyEight's NBA Elo: K × (margin + offset)^power / (intercept + slope × winnerEloDiff). NBA: offset 3, power
   * 0.8, intercept 7.5, slope 0.006.
   */
  | { rule: 'POWER_MOV_AUTOCORRECTED'; offset: number; power: number; intercept: number; slope: number }
  /** Weighted Elo, Angelini, Candila & De Angelis 2022: both updates × the winner's share of the games */
  | { rule: 'WINNER_GAME_SHARE' }
  /** World Rugby: K × multiplier when the margin is above `above` points (× 1.5 above 15) */
  | { rule: 'THRESHOLD'; above: number; multiplier: number };

export type RatingsShootoutRule =
  /** FiveThirtyEight NHL: a full win, rated as won by one goal */
  | { rule: 'FULL_RESULT'; margin?: number }
  /** FIFA's men's ranking (SUM): the shootout winner 0.75, the loser 0.5; not zero-sum */
  | { rule: 'PARTIAL'; winner: number; loser: number };

export type RatingsPolicy = {
  policyName: string;
  /** the published method the policy encodes */
  source: string;
  expectation: ExpectationRule;
  k: RatingsKRule;
  actual: RatingsActualRule;
  /** a WALKOVER: rated as a win (Huang 2014: a straight-sets win), or not rated. Default RATE_AS_WIN */
  walkovers?: 'RATE_AS_WIN' | 'EXCLUDE';
  /** a COMPLETED result with no winner: 0.5 each, as every published Elo-family method scores it; or not rated */
  draws?: 'RATE_AS_HALF' | 'EXCLUDE';
  /** K by the event's tier, then the tournament's, keyed `system:value`; otherwise `k` */
  kByTier?: Record<string, number>;
  margin?: RatingsMarginRule;
  /** a result won in overtime (`score.overtime.decidedIn: 'OVERTIME'`); unset, it is the recorded win */
  overtimeResult?: { rule: 'FULL_RESULT'; margin?: number };
  /** a result won in a shootout (an `-F:SO` decider, or decided outside the score by SHOOTOUT); unset, the recorded win */
  shootoutResult?: RatingsShootoutRule;
  /**
   * FIFA's men's ranking: in the knock-out rounds of a final competition a side that underperforms loses nothing. Read
   * here as a MAIN-stage elimination structure (not round robin, not ad hoc).
   */
  protections?: 'KNOCKOUT_LOSS_PROTECTION'[];
  /** FIVB: a winner who would lose points gains this instead, and the loser loses it (0.01) */
  winnerMinimumGain?: number;
};
