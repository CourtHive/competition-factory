import { POLICY_RATINGS_WORLD_RUGBY } from '@Fixtures/policies/POLICY_RATINGS_WORLD_RUGBY';
import { POLICY_RATINGS_FIVB } from '@Fixtures/policies/POLICY_RATINGS_FIVB';
import { calculateNewRatings } from '@Helpers/ratings/calculateNewRatings';
import { expectedResult, normalCdf } from '@Helpers/ratings/ratingUpdate';
import { describe, expect, it } from 'vitest';

// constants
import { POLICY_TYPE_RATINGS } from '@Constants/policyConstants';
import { FIVB, WORLD_RUGBY } from '@Constants/ratingConstants';

// World Rugby and FIVB rate on their own points scales; each case is the source's own worked example

const RUGBY = POLICY_RATINGS_WORLD_RUGBY[POLICY_TYPE_RATINGS];
const VOLLEYBALL = POLICY_RATINGS_FIVB[POLICY_TYPE_RATINGS];

describe('World Rugby, "Rankings Explanation": Wales (76.92, at home: 79.92) v Scotland (76.36), a gap of 3.56', () => {
  const rate = (params: any) => {
    const result: any = calculateNewRatings({
      expectation: RUGBY.expectation,
      ratingType: WORLD_RUGBY,
      winnerKFactor: 2,
      ...params,
    });
    return result;
  };

  it('a Wales win moves 0.64 each way', () => {
    const { newWinnerRating, newLoserRating } = rate({ winnerRating: 79.92, loserRating: 76.36 });
    expect(newWinnerRating - 79.92).toBeCloseTo(0.64, 2);
    expect(newLoserRating - 76.36).toBeCloseTo(-0.64, 2);
  });

  it('a draw moves Wales −0.36 and Scotland +0.36', () => {
    const { newWinnerRating, newLoserRating } = rate({ winnerRating: 79.92, loserRating: 76.36, winnerActual: 0.5 });
    expect(newWinnerRating - 79.92).toBeCloseTo(-0.36, 2);
    expect(newLoserRating - 76.36).toBeCloseTo(0.36, 2);
  });

  it('a Scotland win moves 1.36 each way', () => {
    const { newWinnerRating, newLoserRating } = rate({ winnerRating: 76.36, loserRating: 79.92 });
    expect(newWinnerRating - 76.36).toBeCloseTo(1.36, 2);
    expect(newLoserRating - 79.92).toBeCloseTo(-1.36, 2);
  });

  it('a Wales win by more than 15 (30-10) moves 1.5 times as much: the page gives 0.64 × 1.5 = 0.96', () => {
    const margin = { rule: RUGBY.margin, marginOfVictory: 20 };
    const { newWinnerRating } = rate({ winnerRating: 79.92, loserRating: 76.36, margin });
    // 0.644 × 1.5 = 0.966 before the page rounds 0.644 to 0.64
    expect(newWinnerRating - 79.92).toBeCloseTo(0.966, 2);
  });

  it('the gap is clamped at 10: a favourite 20 ahead gains nothing for a win', () => {
    const { newWinnerRating } = rate({ winnerRating: 90, loserRating: 70 });
    expect(newWinnerRating).toEqual(90);
  });
});

describe('FIVB, "Examples": Brazil (415) v Japan (192), a World Championship match (MWF 50)', () => {
  const rate = (winnerRating: number, loserRating: number, winnerActual: number) => {
    const result: any = calculateNewRatings({
      expectation: VOLLEYBALL.expectation,
      winnerMinimumGain: VOLLEYBALL.winnerMinimumGain,
      loserActual: -winnerActual,
      winnerKFactor: 50 / 8,
      ratingType: FIVB,
      winnerActual,
      winnerRating,
      loserRating,
    });
    return [result.newWinnerRating, result.newLoserRating];
  };

  it('Δ = 1.784; the result probabilities 76.5 / 15.2 / 4.5 / 2.2 / 1.2 / 0.2 %; EMR +1.76', () => {
    const delta = (8 * (415 - 192)) / 1000;
    expect(delta).toBeCloseTo(1.784, 10);
    const cumulative = [...VOLLEYBALL.expectation.cutPoints.map((cut) => normalCdf(cut + delta)), 1];
    const probabilities = cumulative.map((value, i) => value - (cumulative[i - 1] ?? 0));
    [0.765, 0.152, 0.045, 0.022, 0.012, 0.002].forEach((published, i) =>
      expect(probabilities[i]).toBeCloseTo(published, 2),
    );
    expect(expectedResult(415, 192, VOLLEYBALL.expectation)).toBeCloseTo(1.76, 2);
    expect(expectedResult(192, 415, VOLLEYBALL.expectation)).toBeCloseTo(-1.76, 2);
  });

  it('Brazil 3-0: 416.5 and 190.5', () => {
    const [brazil, japan] = rate(415, 192, 2);
    expect(brazil).toBeCloseTo(416.5, 1);
    expect(japan).toBeCloseTo(190.5, 1);
  });

  it.each([
    ['3-1', 1.5],
    ['3-2', 1],
  ])('Brazil %s: a winner cannot lose points, so +0.01 and −0.01 (the page prints 415.1 and 191.9)', (_, value) => {
    expect(rate(415, 192, value)).toEqual([415.01, 191.99]);
  });

  it.each([
    ['3-2', 1, 209.25, 397.75],
    ['3-1', 1.5, 212.375, 394.625],
    ['3-0', 2, 215.5, 391.5],
  ])(
    'Japan %s: Japan %s and Brazil the rest (the page rounds EMR to 1.76 first)',
    (_, value, japanScore, brazilScore) => {
      const [japan, brazil] = rate(192, 415, value);
      expect(japan).toBeCloseTo(japanScore, 1);
      expect(brazil).toBeCloseTo(brazilScore, 1);
    },
  );
});
