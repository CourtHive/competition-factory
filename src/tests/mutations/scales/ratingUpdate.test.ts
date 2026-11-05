import { expectedResult, LOGISTIC_400, matchesPlayedK, normalCdf, ratingUpdate } from '@Generators/scales/ratingUpdate';
import { expect, it } from 'vitest';

it('expects an even result between equal ratings and about 76% for a 200-point favourite', () => {
  expect(expectedResult(1500, 1500, LOGISTIC_400)).toEqual(0.5);
  expect(expectedResult(1700, 1500, LOGISTIC_400)).toBeCloseTo(0.7597, 4);
  expect(expectedResult(1700, 1500, { rule: 'LOGISTIC', base: 10, spread: 600 })).toBeCloseTo(0.683, 4);
});

it("reads FiveThirtyEight's K as Kovalchik 2016 gives it: 250 / (m + 5)^0.4", () => {
  expect(matchesPlayedK()).toBeCloseTo(250 / Math.pow(5, 0.4), 10);
  expect(matchesPlayedK({ matchesPlayed: 95 })).toBeCloseTo(250 / Math.pow(100, 0.4), 10);
});

it('moves each side by k × (actual − expected), zero-sum when the Ks are equal and the actuals sum to 1', () => {
  const { expected, deltas } = ratingUpdate({
    ratings: [1600, 1400],
    actual: [0, 1],
    k: [20, 20],
    expectation: LOGISTIC_400,
  });
  expect(expected[0] + expected[1]).toBeCloseTo(1, 10);
  expect(deltas[0]).toBeCloseTo(20 * (0 - expected[0]), 10);
  expect(deltas[0] + deltas[1]).toBeCloseTo(0, 10);
});

it('is not zero-sum when the Ks differ', () => {
  const { deltas } = ratingUpdate({ ratings: [1500, 1500], actual: [1, 0], k: [30, 20], expectation: LOGISTIC_400 });
  expect(deltas).toEqual([15, -10]);
});

it.each([
  [0, 0.5],
  [1, 0.8413447460685429],
  [-1.06, 0.14457229966390955],
  [4.5, 0.9999966023268753], // the continued fraction, past z = 3
  [-5, 2.866515718791945e-7],
  [6.5, 0.99999999995984],
])('reads the standard normal distribution at %s as %s (Python erfc)', (x, expected) => {
  expect(normalCdf(x)).toBeCloseTo(expected, 13);
});
