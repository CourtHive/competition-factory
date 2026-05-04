import { predictDrawCompetitiveBands } from '@Query/drawDefinition/predictDrawCompetitiveBands';
import { expect, it, describe } from 'vitest';

// constants and types
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import {
  ADAPTIVE,
  COMPASS,
  DOUBLE_ELIMINATION,
  LUCKY_DRAW,
  ROUND_ROBIN,
  SINGLE_ELIMINATION,
  SWISS,
} from '@Constants/drawDefinitionConstants';

const tightRatings = [4, 4.05, 4.1, 4.15, 4.2, 4.25, 4.3, 4.35];
const wideRatings = [3, 3.5, 4, 4.5, 5, 5.5, 6, 6.5];

describe('predictDrawCompetitiveBands — input validation', () => {
  it('errors with fewer than 2 ratings', () => {
    const result = predictDrawCompetitiveBands({ ratings: [4], drawType: SINGLE_ELIMINATION });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('errors when neither drawType nor projectionMode resolves a mode', () => {
    const result = predictDrawCompetitiveBands({ ratings: tightRatings, drawType: 'NOT_A_REAL_TYPE' });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('accepts an explicit projectionMode without a drawType', () => {
    const result = predictDrawCompetitiveBands({ ratings: tightRatings, projectionMode: 'BALANCED_BRACKET' });
    expect(result.error).toBeUndefined();
    expect(result.projectionMode).toEqual('BALANCED_BRACKET');
  });
});

describe('predictDrawCompetitiveBands — projection modes', () => {
  it('SE pairs top-half against bottom-half — N/2 projected matchUps', () => {
    const result = predictDrawCompetitiveBands({ ratings: tightRatings, drawType: SINGLE_ELIMINATION });
    expect(result.projectionMode).toEqual('BALANCED_BRACKET');
    expect(result.expectedMatchCount).toEqual(4);
    // Top vs bottom pair — sorted desc, the highest plays the lowest
    expect(result.projectedPairs?.[0]).toEqual([4.35, 4]);
  });

  it('Compass / Lucky / Adaptive / Double-Elim all use BALANCED_BRACKET', () => {
    for (const drawType of [COMPASS, LUCKY_DRAW, ADAPTIVE, DOUBLE_ELIMINATION]) {
      const result = predictDrawCompetitiveBands({ ratings: tightRatings, drawType });
      expect(result.projectionMode).toEqual('BALANCED_BRACKET');
    }
  });

  it('Round-robin projects every pair within the group — C(N,2) matchUps', () => {
    const result = predictDrawCompetitiveBands({ ratings: tightRatings.slice(0, 4), drawType: ROUND_ROBIN });
    expect(result.projectionMode).toEqual('ROUND_ROBIN');
    expect(result.expectedMatchCount).toEqual(6);
  });

  it('Round-robin with groupSize splits into groups', () => {
    const result = predictDrawCompetitiveBands({
      ratings: tightRatings,
      drawType: ROUND_ROBIN,
      groupSize: 4,
    });
    // Two groups of 4 → 6 + 6 = 12 projected matchUps
    expect(result.expectedMatchCount).toEqual(12);
  });

  it('Swiss uses MIN_DELTA — adjacent ratings paired', () => {
    const result = predictDrawCompetitiveBands({ ratings: tightRatings, drawType: SWISS });
    expect(result.projectionMode).toEqual('MIN_DELTA');
    expect(result.projectedPairs?.[0]).toEqual([4.35, 4.3]);
    expect(result.expectedMatchCount).toEqual(4);
  });
});

describe('predictDrawCompetitiveBands — band signals', () => {
  it('tight rating band → higher competitive % than a wide band of the same draw type', () => {
    const tight = predictDrawCompetitiveBands({ ratings: tightRatings, drawType: SINGLE_ELIMINATION });
    const wide = predictDrawCompetitiveBands({ ratings: wideRatings, drawType: SINGLE_ELIMINATION });

    expect(tight.competitive).toBeGreaterThan(wide.competitive);
    expect(tight.decisive).toBeLessThan(wide.decisive);
  });

  it('MIN_DELTA always pairs adjacent ratings, so it produces the highest competitive % for any given pool', () => {
    const minDelta = predictDrawCompetitiveBands({ ratings: wideRatings, projectionMode: 'MIN_DELTA' });
    const balanced = predictDrawCompetitiveBands({ ratings: wideRatings, projectionMode: 'BALANCED_BRACKET' });

    expect(minDelta.competitive).toBeGreaterThan(balanced.competitive);
  });

  it('aggregate is the mean of per-matchUp predictions', () => {
    const result = predictDrawCompetitiveBands({ ratings: tightRatings, drawType: SINGLE_ELIMINATION });
    const meanCompetitive =
      (result.perMatchUpPredictions ?? []).reduce((acc, p) => acc + p.competitive, 0) /
      (result.perMatchUpPredictions?.length || 1);

    expect(result.competitive).toBeCloseTo(meanCompetitive, 6);
  });
});

describe('predictDrawCompetitiveBands — odd N handling', () => {
  it('balanced bracket drops the median when N is odd (no synthetic bye)', () => {
    const oddRatings = [5, 4.5, 4, 3.5, 3];
    const result = predictDrawCompetitiveBands({ ratings: oddRatings, drawType: SINGLE_ELIMINATION });
    // 5 / 2 = 2 pairs (floor); the median rating 4 is unpaired
    expect(result.expectedMatchCount).toEqual(2);
  });

  it('MIN_DELTA drops the trailing odd-out rating', () => {
    const oddRatings = [5, 4.5, 4, 3.5, 3];
    const result = predictDrawCompetitiveBands({ ratings: oddRatings, projectionMode: 'MIN_DELTA' });
    expect(result.expectedMatchCount).toEqual(2);
  });
});
