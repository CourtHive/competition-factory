import {
  resolveDeltaBoundaries,
  resolveScaleOrientation,
  signedRatingDelta,
  resolveDeltaBand,
} from '@Query/matchUp/resolveDeltaBand';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import { INVALID_POLICY_DEFINITION, INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { ANCHOR, DOWN, EVEN, STRETCH, UP } from '@Constants/statsConstants';
import { ELO, UTR, WTN } from '@Constants/ratingConstants';

// WTN range is [40, 1] => magnitude 39, and `ascending: true` (lower is stronger).
// UTR range is [1, 16] => magnitude 15, and `ascending: false`.
const WTN_RANGE_MAGNITUDE = 39;

// Absolute-unit bands need no scale at all — nothing to convert.
const FIVE_BANDS = [
  { key: ANCHOR, max: -4 },
  { key: DOWN, max: -0.5 },
  { key: EVEN, max: 0.5 },
  { key: UP, max: 4 },
  { key: STRETCH },
];

describe('resolveDeltaBand — band count and names come from policy', () => {
  it('resolves 2 bands', () => {
    const bands = [{ key: 'LOWER', max: 0 }, { key: 'UPPER' }];
    expect(resolveDeltaBand(-1, bands).band).toEqual('LOWER');
    expect(resolveDeltaBand(0, bands).band).toEqual('LOWER'); // boundary is inclusive
    expect(resolveDeltaBand(0.1, bands).band).toEqual('UPPER');
  });

  it('resolves 3 bands', () => {
    const bands = [{ key: 'A', max: -1 }, { key: 'B', max: 1 }, { key: 'C' }];
    const resolved = [-2, -1, 0, 1, 1.5].map((delta) => resolveDeltaBand(delta, bands).band);
    expect(resolved).toEqual(['A', 'A', 'B', 'B', 'C']);
  });

  it('resolves 5 bands, boundaries inclusive on the upper edge', () => {
    const deltas = [-4, -3.99, -0.5, -0.49, 0.5, 0.51, 4, 4.01];
    const resolved = deltas.map((delta) => resolveDeltaBand(delta, FIVE_BANDS).band);
    expect(resolved).toEqual([ANCHOR, DOWN, DOWN, EVEN, EVEN, UP, UP, STRETCH]);
  });

  it('resolves 9 bands', () => {
    const bands: any[] = [-4, -3, -2, -1, 0, 1, 2, 3].map((max, index) => ({ key: `B${index}`, max }));
    bands.push({ key: 'B8' });

    expect(resolveDeltaBoundaries(bands).boundaries).toHaveLength(9);

    const resolved = [-5, -4, -3.5, 0, 0.5, 3, 3.5].map((delta) => resolveDeltaBand(delta, bands).band);
    expect(resolved).toEqual(['B0', 'B0', 'B1', 'B4', 'B5', 'B7', 'B8']);
  });

  it('supports asymmetric boundaries — +2 up against -4 down', () => {
    const asymmetric = [
      { key: ANCHOR, max: -4 },
      { key: DOWN, max: -0.5 },
      { key: EVEN, max: 0.5 },
      { key: UP, max: 2 },
      { key: STRETCH },
    ];
    // -3 is DOWN here but +3 is already STRETCH: the same magnitude lands in
    // different bands, which is the whole point of the ordered list.
    expect(resolveDeltaBand(-3, asymmetric).band).toEqual(DOWN);
    expect(resolveDeltaBand(3, asymmetric).band).toEqual(STRETCH);
    expect(resolveDeltaBand(2, asymmetric).band).toEqual(UP);
  });

  it('the first entry is open-ended below and the last open-ended above', () => {
    expect(resolveDeltaBand(-1_000_000, FIVE_BANDS).band).toEqual(ANCHOR);
    expect(resolveDeltaBand(1_000_000, FIVE_BANDS).band).toEqual(STRETCH);
  });

  it('a single-entry list is a valid (degenerate) policy — one band catches everything', () => {
    const bands = [{ key: 'ALL' }];
    expect(resolveDeltaBand(-99, bands).band).toEqual('ALL');
    expect(resolveDeltaBand(99, bands).band).toEqual('ALL');
  });
});

describe('resolveDeltaBand — maxPct is a percentage of the scale range', () => {
  it('converts maxPct against the scale range magnitude', () => {
    const { boundaries } = resolveDeltaBoundaries([{ key: UP, maxPct: 10.3 }, { key: STRETCH }], WTN);
    expect(boundaries?.[0].max).toBeCloseTo((10.3 / 100) * WTN_RANGE_MAGNITUDE, 10);
    expect(boundaries?.[0].max).toBeCloseTo(4.017, 10);
    expect(boundaries?.[1].max).toBeUndefined();
  });

  it('maxPct and the equivalent max resolve identically', () => {
    const asPct = [{ key: UP, maxPct: 10.3 }, { key: STRETCH }];
    const asUnits = [{ key: UP, max: 4.017 }, { key: STRETCH }];

    for (const delta of [-10, 0, 4, 4.016, 4.018, 10]) {
      expect(resolveDeltaBand(delta, asPct, WTN).band).toEqual(resolveDeltaBand(delta, asUnits, WTN).band);
    }
    expect(resolveDeltaBand(4, asPct, WTN).band).toEqual(UP);
    expect(resolveDeltaBand(4.018, asPct, WTN).band).toEqual(STRETCH);
  });

  it('the SAME maxPct policy yields different absolute boundaries per scale', () => {
    const bands = [{ key: UP, maxPct: 10 }, { key: STRETCH }];
    // 10% of WTN's 39-point range is 3.9; of UTR's 15-point range, 1.5; of
    // ELO's 3000-point range, 300. This portability is why the shipped default
    // uses maxPct.
    expect(resolveDeltaBoundaries(bands, WTN).boundaries?.[0].max).toBeCloseTo(3.9, 10);
    expect(resolveDeltaBoundaries(bands, UTR).boundaries?.[0].max).toBeCloseTo(1.5, 10);
    expect(resolveDeltaBoundaries(bands, ELO).boundaries?.[0].max).toBeCloseTo(300, 10);
  });

  it('errors on maxPct against a scale with no range — never a silent fallback to absolute units', () => {
    const bands = [{ key: UP, maxPct: 10.3 }, { key: STRETCH }];

    const unknownScale: any = resolveDeltaBand(4, bands, 'NOT_A_REGISTERED_SCALE');
    expect(unknownScale.error).toEqual(INVALID_POLICY_DEFINITION);
    expect(unknownScale.info).toContain('maxPct');
    expect(unknownScale.band).toBeUndefined();

    const noScale: any = resolveDeltaBand(4, bands);
    expect(noScale.error).toEqual(INVALID_POLICY_DEFINITION);
    expect(noScale.band).toBeUndefined();

    // Falsification: the same shape in absolute units is accepted with no
    // scaleName, so the rejection above is about maxPct, not about the list.
    expect(resolveDeltaBand(4, [{ key: UP, max: 4.017 }, { key: STRETCH }]).band).toEqual(UP);
  });
});

describe('resolveDeltaBand — policy validation', () => {
  it('rejects an entry declaring both max and maxPct', () => {
    const result: any = resolveDeltaBand(0, [{ key: UP, max: 4, maxPct: 10 }, { key: STRETCH }], WTN);
    expect(result.error).toEqual(INVALID_POLICY_DEFINITION);
    expect(result.info).toContain('both max and maxPct');
  });

  it('rejects a bounded final entry — it must catch the remainder', () => {
    const result: any = resolveDeltaBand(
      0,
      [
        { key: DOWN, max: -1 },
        { key: UP, max: 1 },
      ],
      WTN,
    );
    expect(result.error).toEqual(INVALID_POLICY_DEFINITION);
    expect(result.info).toContain('final entry');
  });

  it('rejects a non-final entry with no bound', () => {
    const result: any = resolveDeltaBand(0, [{ key: DOWN }, { key: UP, max: 1 }, { key: STRETCH }], WTN);
    expect(result.error).toEqual(INVALID_POLICY_DEFINITION);
    expect(result.info).toContain('requires max or maxPct');
  });

  it('rejects boundaries that do not ascend — an out-of-order band is unreachable', () => {
    const result: any = resolveDeltaBand(0, [{ key: UP, max: 4 }, { key: DOWN, max: -4 }, { key: STRETCH }]);
    expect(result.error).toEqual(INVALID_POLICY_DEFINITION);
    expect(result.info).toContain('ascend');
  });

  it('rejects duplicate boundaries (equal is not ascending)', () => {
    const result: any = resolveDeltaBand(0, [{ key: 'A', max: 1 }, { key: 'B', max: 1 }, { key: 'C' }]);
    expect(result.error).toEqual(INVALID_POLICY_DEFINITION);
  });

  it('rejects a non-finite bound', () => {
    const result: any = resolveDeltaBand(0, [{ key: 'A', max: Number.NaN }, { key: 'B' }]);
    expect(result.error).toEqual(INVALID_POLICY_DEFINITION);
    expect(result.info).toContain('finite');
  });

  it('rejects an entry with no key', () => {
    const result: any = resolveDeltaBand(0, [{ max: 1 } as any, { key: 'B' }]);
    expect(result.error).toEqual(INVALID_POLICY_DEFINITION);
    expect(result.info).toContain('key');
  });

  it('rejects a missing or empty deltaBands list', () => {
    expect(resolveDeltaBand(0).error).toEqual(MISSING_VALUE);
    expect(resolveDeltaBand(0, []).error).toEqual(MISSING_VALUE);
    expect(resolveDeltaBoundaries(undefined, WTN).error).toEqual(MISSING_VALUE);
  });

  it('rejects a non-finite signedDelta', () => {
    for (const delta of [Number.NaN, Number.POSITIVE_INFINITY, undefined as any, '2' as any]) {
      const result: any = resolveDeltaBand(delta, FIVE_BANDS);
      expect(result.error).toEqual(INVALID_VALUES);
      expect(result.band).toBeUndefined();
    }
  });
});

describe('sign orientation is resolved inside the factory', () => {
  it('flips with ratingsParameters.ascending', () => {
    // WTN ascending: true (lower is stronger) — a HIGHER own value means the
    // opponent was stronger, so own - opp.
    expect(signedRatingDelta({ ownRating: 10, oppRating: 12, scaleName: WTN }).signedDelta).toEqual(-2);
    // UTR ascending: false (higher is stronger) — opp - own.
    expect(signedRatingDelta({ ownRating: 10, oppRating: 12, scaleName: UTR }).signedDelta).toEqual(2);
  });

  it('is oriented so positive always means the tougher opponent', () => {
    // WTN 20 vs a stronger (lower) 15 => playing up.
    expect(signedRatingDelta({ ownRating: 20, oppRating: 15, scaleName: WTN }).signedDelta).toEqual(5);
    // UTR 5 vs a stronger (higher) 10 => playing up.
    expect(signedRatingDelta({ ownRating: 5, oppRating: 10, scaleName: UTR }).signedDelta).toEqual(5);
  });

  it('an explicit ascending overrides the scale', () => {
    expect(signedRatingDelta({ ownRating: 10, oppRating: 12, scaleName: WTN, ascending: false }).signedDelta).toEqual(
      2,
    );
    expect(resolveScaleOrientation({ scaleName: WTN, ascending: false }).ascending).toEqual(false);
  });

  it('errors when orientation cannot be established — never assumes a direction', () => {
    const unknown: any = signedRatingDelta({ ownRating: 10, oppRating: 12, scaleName: 'HOUSE_LADDER' });
    expect(unknown.error).toEqual(MISSING_VALUE);
    expect(unknown.signedDelta).toBeUndefined();

    expect(resolveScaleOrientation({}).error).toEqual(MISSING_VALUE);

    // ...but an explicit orientation makes the same custom scale usable.
    const explicit = signedRatingDelta({ ownRating: 10, oppRating: 12, scaleName: 'HOUSE_LADDER', ascending: true });
    expect(explicit.signedDelta).toEqual(-2);
  });

  it('errors on non-numeric ratings', () => {
    expect(signedRatingDelta({ ownRating: 10, scaleName: WTN }).error).toEqual(INVALID_VALUES);
    expect(signedRatingDelta({ ownRating: Number.NaN, oppRating: 3, scaleName: WTN }).error).toEqual(INVALID_VALUES);
  });

  it('resolves scale orientation for every scale it is asked about', () => {
    expect(resolveScaleOrientation({ scaleName: WTN }).ascending).toEqual(true);
    expect(resolveScaleOrientation({ scaleName: UTR }).ascending).toEqual(false);
    expect(resolveScaleOrientation({ scaleName: ELO }).ascending).toEqual(false);
  });
});
