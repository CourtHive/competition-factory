/**
 * The one Elo-family update in the factory: each side moves by `k × (actual − expected)` from the ratings before the
 * result. `generateDynamicRatings` and the competition policy's dynamic form rating both call it; the policy that
 * chooses each part is planned in Mentat `planning/RATINGS_POLICY_PLAN.md`.
 */

export type ExpectationRule =
  | {
      rule: 'LOGISTIC';
      /** 10 in every published Elo-family method surveyed */
      base: number;
      /** 400 in most published methods; 600 in FIFA's men's ranking */
      spread: number;
    }
  /** World Rugby: 0.5 + the rating gap × slope, the gap clamped to ±cap (slope 0.05, cap 10) */
  | { rule: 'LINEAR'; slope: number; cap: number }
  /**
   * FIVB: the expected result value Σ P(i) × resultValues(i), the result probabilities from the standard normal Φ at
   * the cut-points shifted by scale × the rating gap (scale 0.008).
   */
  | { rule: 'ORDERED_PROBIT'; scale: number; cutPoints: number[]; resultValues: number[] };

export const LOGISTIC_400 = { rule: 'LOGISTIC', base: 10, spread: 400 } as const satisfies ExpectationRule;

/** The expected result of a side rated `rating` against `opponentRating`: 0-1, or a result value (ORDERED_PROBIT). */
export function expectedResult(rating: number, opponentRating: number, expectation: ExpectationRule): number {
  const gap = rating - opponentRating;
  if (expectation.rule === 'LINEAR') {
    const { slope, cap } = expectation;
    return 0.5 + Math.max(-cap, Math.min(cap, gap)) * slope;
  }
  if (expectation.rule === 'ORDERED_PROBIT') {
    const { scale, cutPoints, resultValues } = expectation;
    const cumulative = [...cutPoints.map((cut) => normalCdf(cut + scale * gap)), 1];
    return cumulative.reduce((sum, value, i) => sum + (value - (cumulative[i - 1] ?? 0)) * resultValues[i], 0);
  }
  return 1 / (1 + Math.pow(expectation.base, -gap / expectation.spread));
}

/** The standard normal distribution function (Abramowitz and Stegun 7.1.26: absolute error under 1.5e-7). */
export function normalCdf(x: number): number {
  const z = Math.abs(x) / Math.SQRT2;
  const t = 1 / (1 + 0.3275911 * z);
  const polynomial = t * (0.254829592 + t * (-0.284496736 + t * (1.421413741 + t * (-1.453152027 + t * 1.061405429))));
  const erf = 1 - polynomial * Math.exp(-z * z);
  return x >= 0 ? (1 + erf) / 2 : (1 - erf) / 2;
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
