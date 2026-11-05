import { getRatingConvertedFromELO, getRatingConvertedToELO } from '@Helpers/ratings/eloConversions';
import { expect, it } from 'vitest';

// constants
import { UTR, WTN } from '@Constants/ratingConstants';

let scenarios: any[] = [
  { ratingType: WTN, ratingValue: 10 },
  { ratingType: UTR, ratingValue: 10 },
];

it.each(scenarios)('can reliably convert to and from elo', (scenario) => {
  const convertedRating = getRatingConvertedToELO({
    sourceRatingType: scenario.ratingType,
    sourceRating: scenario.ratingValue,
  });
  const originalRating = getRatingConvertedFromELO({
    targetRatingType: scenario.ratingType,
    sourceRating: convertedRating,
  });
  expect(originalRating).toEqual(scenario.ratingValue);
});

scenarios = [
  { ratingType: WTN, highValue: 16, lowValue: 10, inverted: true },
  { ratingType: UTR, highValue: 16, lowValue: 10 },
];

it.each(scenarios)('propertly handles inverted scales when converting to ELO', (scenario) => {
  const convertedHighRating = getRatingConvertedToELO({
    sourceRatingType: scenario.ratingType,
    sourceRating: scenario.highValue,
  });
  const originalRating = getRatingConvertedFromELO({
    targetRatingType: scenario.ratingType,
    sourceRating: convertedHighRating,
  });
  expect(originalRating).toEqual(scenario.highValue);

  const convertedLowRating = getRatingConvertedToELO({
    sourceRatingType: scenario.ratingType,
    sourceRating: scenario.lowValue,
  });
  const originalRating2 = getRatingConvertedFromELO({
    targetRatingType: scenario.ratingType,
    sourceRating: convertedLowRating,
  });
  expect(originalRating2).toEqual(scenario.lowValue);

  if (scenario.inverted) {
    expect(convertedHighRating).toBeLessThan(convertedLowRating);
  } else {
    expect(convertedHighRating).toBeGreaterThan(convertedLowRating);
  }
});
