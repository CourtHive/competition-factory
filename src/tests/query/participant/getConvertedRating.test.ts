import { getConvertedRating } from '@Query/participant/getConvertedRating';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SINGLES, DOUBLES } from '@Constants/matchUpTypes';
import { ELO } from '@Constants/ratingConstants';

describe('getConvertedRating', () => {
  // Unit tests for error handling
  it('returns error when ratings parameter is missing', () => {
    const result = getConvertedRating({} as any);

    expect(result.error).toBeDefined();
  });

  it('returns error when ratings is not an object', () => {
    const result = getConvertedRating({ ratings: 'not an object' as any });

    expect(result.error).toBeDefined();
  });

  it('returns error when ratings is null', () => {
    const result = getConvertedRating({ ratings: null as any });

    expect(result.error).toBeDefined();
  });

  it('returns error when ratings is an array', () => {
    const result = getConvertedRating({ ratings: [] as any });

    expect(result.error).toBeDefined();
  });

  // Unit tests for matchUpType handling
  it('defaults to SINGLES when matchUpType not provided', () => {
    const ratings = {
      [SINGLES]: [{ scaleName: ELO, scaleValue: 1500 }],
    };

    const result = getConvertedRating({ ratings });

    expect(result.scaleValue).toBe(1500);
  });

  it('defaults to SINGLES when matchUpType is invalid', () => {
    const ratings = {
      [SINGLES]: [{ scaleName: ELO, scaleValue: 1500 }],
    };

    const result = getConvertedRating({
      matchUpType: 'INVALID_TYPE' as any,
      ratings,
    });

    expect(result.scaleValue).toBe(1500);
  });

  it('uses DOUBLES matchUpType when provided', () => {
    const ratings = {
      [SINGLES]: [{ scaleName: ELO, scaleValue: 1500 }],
      [DOUBLES]: [{ scaleName: ELO, scaleValue: 1400 }],
    };

    const result = getConvertedRating({
      matchUpType: DOUBLES,
      ratings,
    });

    expect(result.scaleValue).toBe(1400);
  });

  // Unit tests for targetRatingType handling
  it('defaults to ELO when targetRatingType not provided', () => {
    const ratings = {
      [SINGLES]: [{ scaleName: ELO, scaleValue: 1500 }],
    };

    const result = getConvertedRating({ ratings });

    expect(result.scaleValue).toBeDefined();
  });

  it('uses provided targetRatingType', () => {
    const ratings = {
      [SINGLES]: [
        { scaleName: ELO, scaleValue: 1500 },
        { scaleName: 'WTN', scaleValue: 30 },
      ],
    };

    const result = getConvertedRating({
      targetRatingType: 'WTN',
      ratings,
    });

    // Should find WTN and return it directly
    expect(result.convertedRating).toBe(30);
  });

  it('returns NOT_FOUND when matchUpType has no ratings', () => {
    const ratings = {
      [SINGLES]: [{ scaleName: ELO, scaleValue: 1500 }],
    };

    const result = getConvertedRating({
      ratings,
      matchUpType: DOUBLES, // No doubles ratings
    });

    expect(result.error).toBe(INVALID_VALUES);
  });

  // Unit tests for rating conversion
  it('returns source rating when it matches target type', () => {
    const ratings = {
      [SINGLES]: [{ scaleName: ELO, scaleValue: 1500 }],
    };

    const result = getConvertedRating({
      ratings,
      targetRatingType: ELO,
    });

    expect(result.scaleValue).toBe(1500);
  });

  it('uses first rating when multiple ratings of same type', () => {
    const ratings = {
      [SINGLES]: [
        { scaleName: ELO, scaleValue: 1500 },
        { scaleName: ELO, scaleValue: 1600 },
      ],
    };

    const result = getConvertedRating({ ratings });

    expect(result.scaleValue).toBe(1500);
  });

  it('handles ratings with accessor for scaleValue', () => {
    const ratings = {
      [SINGLES]: [
        {
          scaleValue: { wtnRating: 35, confidence: 0.9 },
          scaleName: 'WTN',
        },
      ],
    };

    const result = getConvertedRating({
      targetRatingType: ELO,
      ratings,
    });

    // Should use accessor to get rating value
    expect(result.sourceRating).toBeDefined();
    expect(result.convertedRating).toBeDefined();
  });

  it('handles empty ratings array for matchUpType', () => {
    const ratings = { [SINGLES]: [] };

    const result = getConvertedRating({
      matchUpType: SINGLES,
      ratings,
    });

    expect(result.error).toBe(INVALID_VALUES);
  });

  it('handles undefined ratings array for matchUpType', () => {
    const ratings = {
      [SINGLES]: undefined,
    };

    const result = getConvertedRating({
      ratings,
      matchUpType: SINGLES,
    });

    expect(result.error).toBe(INVALID_VALUES);
  });

  it('returns source rating object when target matches source', () => {
    const ratingObject = {
      scaleName: ELO,
      scaleValue: 1500,
      scaleDate: '2024-01-01',
    };

    const ratings = {
      [SINGLES]: [ratingObject],
    };

    const result = getConvertedRating({
      ratings,
      targetRatingType: ELO,
    });

    expect(result).toEqual(ratingObject);
  });

  it('converts rating and includes source rating in result', () => {
    const ratings = {
      [SINGLES]: [
        {
          scaleName: 'NTRP',
          scaleValue: 4,
        },
      ],
    };

    const result = getConvertedRating({
      targetRatingType: ELO,
      ratings,
    });

    expect(result.sourceRating).toBe(4);
    expect(result.convertedRating).toBeDefined();
    expect(typeof result.convertedRating).toBe('number');
  });

  it('handles complex rating object with nested values', () => {
    const ratings = {
      [SINGLES]: [
        {
          scaleName: 'UTR',
          scaleValue: {
            reliability: 'High',
            utrRating: 10.5,
          },
        },
      ],
    };

    const result = getConvertedRating({
      targetRatingType: ELO,
      ratings,
    });

    expect(result.sourceRating).toBeDefined();
  });

  it('preserves all rating metadata in result', () => {
    const ratingObject = {
      scaleName: 'WTN',
      scaleValue: { rating: 30, confidence: 0.8 },
      scaleDate: '2024-01-01',
      eventType: SINGLES,
    };

    const ratings = {
      [SINGLES]: [ratingObject],
    };

    const result = getConvertedRating({
      ratings,
      targetRatingType: 'WTN',
    });

    expect(result.scaleName).toBe('WTN');
    expect(result.scaleDate).toBe('2024-01-01');
    expect(result.eventType).toBe(SINGLES);
  });
});
