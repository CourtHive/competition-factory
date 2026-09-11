import { resolveScaleValueNumber, hasScaleValueNumber } from '@Query/scales/resolveScaleValue';
import { expect, it, describe } from 'vitest';

/**
 * Every case here is tied to a defect this helper exists to prevent. The string
 * and empty-string shapes are copied from production records (ITA regional
 * championships), not invented: mocksEngine emits numbers, so a synthetic-only
 * fixture cannot exercise either one.
 */

describe('resolveScaleValueNumber — primitives', () => {
  it('returns a number unchanged', () => {
    expect(resolveScaleValueNumber(12.48)).toBe(12.48);
    expect(resolveScaleValueNumber(1500)).toBe(1500);
  });

  it('reads a NUMERIC STRING, which is how ingested records store ratings', () => {
    expect(resolveScaleValueNumber('12.48')).toBe(12.48);
    expect(resolveScaleValueNumber(' 12.48 ')).toBe(12.48);
  });

  it('PRESERVES a legitimate zero', () => {
    // PSA, SQUASH_LEVELS, ITTF and BWF all declare 0 inside their valid range.
    // Any truthiness test here erases a real competitor from seeding.
    expect(resolveScaleValueNumber(0)).toBe(0);
    expect(resolveScaleValueNumber('0')).toBe(0);
    expect(hasScaleValueNumber(0)).toBe(true);
  });

  it('rejects an empty string rather than reading it as zero', () => {
    for (const empty of ['', '   ', '\t']) {
      expect(resolveScaleValueNumber(empty)).toBeUndefined();
      expect(hasScaleValueNumber(empty)).toBe(false);
    }
  });

  it('rejects nullish and non-numeric values without coercing them', () => {
    for (const value of [null, undefined, 'unrated', 'N/A', true, false, {}, []]) {
      expect(resolveScaleValueNumber(value)).toBeUndefined();
    }
  });

  it('rejects NaN and Infinity', () => {
    for (const value of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY, 'Infinity']) {
      expect(resolveScaleValueNumber(value)).toBeUndefined();
    }
  });
});

describe('resolveScaleValueNumber — object shapes', () => {
  it('resolves via an explicit accessor', () => {
    expect(resolveScaleValueNumber({ utrRating: '12.48' }, { accessor: 'utrRating' })).toBe(12.48);
  });

  it("resolves via the scale's declared accessor when none is passed", () => {
    expect(resolveScaleValueNumber({ utrRating: '12.48' }, { scaleName: 'UTR' })).toBe(12.48);
    expect(resolveScaleValueNumber({ wtnRating: 4.13, confidence: 90 }, { scaleName: 'WTN' })).toBe(4.13);
  });

  it('takes the RATING, not a sibling attribute, for a multi-property scale', () => {
    // WTN carries both wtnRating and confidence. Resolving to confidence would
    // be catastrophic and silent, so scaleName must win over property order.
    const reordered = { confidence: 90, wtnRating: 4.13 };
    expect(resolveScaleValueNumber(reordered, { scaleName: 'WTN' })).toBe(4.13);
    expect(resolveScaleValueNumber({ reliabilityScore: 80, duprRating: 4.5 }, { scaleName: 'DUPR' })).toBe(4.5);
  });

  it('rejects an object whose accessor holds an empty string', () => {
    // Real records use '' for a player with no rating on that scale.
    expect(resolveScaleValueNumber({ utrRating: '' }, { scaleName: 'UTR' })).toBeUndefined();
    expect(hasScaleValueNumber({ utrRating: '' }, { scaleName: 'UTR' })).toBe(false);
  });

  it('falls back to the first resolvable property for an unknown scale', () => {
    expect(resolveScaleValueNumber({ someRating: '9.5' })).toBe(9.5);
    expect(resolveScaleValueNumber({ label: 'unrated', someRating: 9.5 })).toBe(9.5);
  });

  it('never reads an array index as a rating', () => {
    expect(resolveScaleValueNumber([12.48])).toBeUndefined();
  });

  it('returns undefined for an object with nothing numeric in it', () => {
    expect(resolveScaleValueNumber({ utrRating: '', confidence: '' }, { scaleName: 'UTR' })).toBeUndefined();
    expect(resolveScaleValueNumber({ note: 'unrated' })).toBeUndefined();
  });
});

describe('resolveScaleValueNumber — the numeric path is unchanged', () => {
  it('agrees with plain arithmetic for values that already worked', () => {
    // Guards the migration: nothing that was correct before may move.
    const cases: [unknown, number][] = [
      [4.13, 4.13],
      [0, 0],
      [1500, 1500],
      [-200, -200],
    ];
    for (const [input, expected] of cases) {
      expect(resolveScaleValueNumber(input)).toBe(expected);
    }
  });
});
