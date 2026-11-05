/**
 * The one Elo-family update in the factory: each side moves by `k × (actual − expected)` from the ratings before the
 * result. `generateDynamicRatings` and the competition policy's dynamic form rating both call it; the policy that
 * chooses each part is planned in Mentat `planning/RATINGS_POLICY_PLAN.md`.
 */

export type ExpectationRule = {
  rule: 'LOGISTIC';
  /** 10 in every published Elo-family method surveyed */
  base: number;
  /** 400 in most published methods; 600 in FIFA's men's ranking */
  spread: number;
};

export const LOGISTIC_400: ExpectationRule = { rule: 'LOGISTIC', base: 10, spread: 400 };

/** The expected result (0-1) of a side rated `rating` against `opponentRating`. */
export function expectedResult(rating: number, opponentRating: number, expectation: ExpectationRule): number {
  return 1 / (1 + Math.pow(expectation.base, (opponentRating - rating) / expectation.spread));
}

/**
 * FiveThirtyEight's tennis K, as Kovalchik 2016 describes it: `250 / (m + 5)^0.4`, where `m` is the player's career
 * matches played before this one.
 */
export function matchesPlayedK({ matchesPlayed = 0, numerator = 250, offset = 5, shape = 0.4 } = {}): number {
  return numerator / Math.pow(matchesPlayed + offset, shape);
}

type RatingUpdateArgs = {
  ratings: [number, number];
  /** each side's actual result: 1 / 0.5 / 0, or a share of the score */
  actual: [number, number];
  /** each side's K; equal Ks make the update zero-sum */
  k: [number, number];
  expectation: ExpectationRule;
};

export function ratingUpdate({ ratings, actual, k, expectation }: RatingUpdateArgs): {
  expected: [number, number];
  deltas: [number, number];
} {
  const expected: [number, number] = [
    expectedResult(ratings[0], ratings[1], expectation),
    expectedResult(ratings[1], ratings[0], expectation),
  ];
  const deltas: [number, number] = [k[0] * (actual[0] - expected[0]), k[1] * (actual[1] - expected[1])];
  return { expected, deltas };
}
