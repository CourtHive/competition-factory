import { getMatchUpRatingDelta } from '@Query/matchUp/getMatchUpRatingDelta';
import { getConvertedRating } from '@Query/participant/getConvertedRating';
import { getScaledEntries } from '@Query/event/getScaledEntries';
import { getAvgWTN } from '@Query/scales/getAvgWTN';
import { expect, it, describe } from 'vitest';

// constants and types
import { RATING, SEEDING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/matchUpTypes';

/**
 * Regression tests for a class of defect the suite had no coverage for: scale
 * values arriving as STRINGS, as an EMPTY STRING, or as a legitimate ZERO.
 *
 * `mocksEngine` emits numbers, so every existing test exercised only the one
 * shape that already worked. The shapes here are copied from production records
 * (ITA regional championships): `{ utrRating: '12.48' }` for a rated player and
 * `{ utrRating: '' }` for one with no rating on that scale.
 *
 * Each block names the wrong value the code produced before the fix, because
 * "returns undefined" and "returns the worst possible rating" are both silent,
 * and the second is far more dangerous.
 */

const utr = (utrRating: string | number) => ({ scaleValue: { utrRating }, scaleName: 'UTR' });

function participantWithRating(participantId: string, utrRating: string | number) {
  return { participantId, ratings: { [SINGLES]: [utr(utrRating)] } };
}

describe('getMatchUpRatingDelta — string ratings are not "missing data"', () => {
  const matchUpFor = (a: string | number, b: string | number) => ({
    matchUpType: SINGLES,
    winningSide: 1,
    sides: [
      { sideNumber: 1, participant: participantWithRating('a', a) },
      { sideNumber: 2, participant: participantWithRating('b', b) },
    ],
  });

  it('resolves a delta from STRING ratings', () => {
    // Before: undefined, and the caller documents undefined as "missing data,
    // not a caller mistake" — so a fully rated draw reported nothing, silently.
    const result: any = getMatchUpRatingDelta({
      matchUp: matchUpFor('12.48', '10.05'),
      scaleAccessor: 'utrRating',
      scaleName: 'UTR',
    });
    // Sign is the module's own perspective convention; asserted here against
    // the value the NUMERIC path produces for identical inputs, so this test
    // pins "strings behave like numbers" rather than re-deriving the convention.
    expect(result.signedDelta).toBeCloseTo(-2.43, 6);
  });

  it('gives string and number ratings the identical delta', () => {
    const asStrings: any = getMatchUpRatingDelta({
      matchUp: matchUpFor('12.48', '10.05'),
      scaleAccessor: 'utrRating',
      scaleName: 'UTR',
    });
    const asNumbers: any = getMatchUpRatingDelta({
      matchUp: matchUpFor(12.48, 10.05),
      scaleAccessor: 'utrRating',
      scaleName: 'UTR',
    });
    expect(asStrings.signedDelta).toBeCloseTo(asNumbers.signedDelta, 10);
  });

  it('still reports no delta when a side genuinely has no rating', () => {
    const result: any = getMatchUpRatingDelta({
      matchUp: matchUpFor('12.48', ''),
      scaleAccessor: 'utrRating',
      scaleName: 'UTR',
    });
    expect(result.signedDelta).toBeUndefined();
  });
});

describe('getConvertedRating — an empty rating must not become the worst rating', () => {
  it('converts a STRING rating', () => {
    const result: any = getConvertedRating({
      ratings: { [SINGLES]: [utr('12.48')] },
      targetRatingType: 'WTN',
      matchUpType: SINGLES,
    });
    expect(result.error).toBeUndefined();
    expect(typeof result.convertedRating).toBe('number');
  });

  it('REFUSES an empty-string rating instead of returning the worst possible WTN', () => {
    // Before: the `||` fallback passed the whole object into the conversion,
    // producing NaN -> `|| 0` -> `40 - 0` = WTN 40, the worst on the scale,
    // reported as a successful conversion.
    const result: any = getConvertedRating({
      ratings: { [SINGLES]: [utr('')] },
      targetRatingType: 'WTN',
      matchUpType: SINGLES,
    });
    expect(result.convertedRating).toBeUndefined();
    expect(result.error).toBeDefined();
  });

  it('agrees between the string and number representations', () => {
    const asString: any = getConvertedRating({
      ratings: { [SINGLES]: [utr('12.48')] },
      targetRatingType: 'WTN',
      matchUpType: SINGLES,
    });
    const asNumber: any = getConvertedRating({
      ratings: { [SINGLES]: [utr(12.48)] },
      targetRatingType: 'WTN',
      matchUpType: SINGLES,
    });
    expect(asString.convertedRating).toBeCloseTo(asNumber.convertedRating, 10);
  });
});

describe('getScaledEntries — zero is a rating, not an absence', () => {
  const buildRecord = (values: (number | string)[], scaleName: string) => {
    const participants = values.map((scaleValue, index) => ({
      participantId: `p${index}`,
      participantType: 'INDIVIDUAL',
      timeItems: [
        {
          itemType: `SCALE.${RATING}.${SINGLES}.${scaleName}`,
          itemValue: scaleValue,
        },
      ],
    }));
    return {
      tournamentRecord: { participants },
      entries: values.map((_, index) => ({ participantId: `p${index}`, entryStatus: 'DIRECT_ACCEPTANCE' })),
    };
  };

  it('keeps a participant on exactly ZERO points', () => {
    // PSA declares range [0, 3000]; a new player really is on zero. Before, the
    // `!Number.parseFloat(v)` truthiness test dropped them, and because
    // autoSeeding runs through this they could never be seeded.
    const { tournamentRecord, entries } = buildRecord([0, 500, 900, 1200], 'PSA');
    const result: any = getScaledEntries({
      scaleAttributes: { scaleType: RATING, scaleName: 'PSA', eventType: SINGLES },
      tournamentRecord: tournamentRecord as any,
      entries: entries as any,
    });
    expect(result.scaledEntries).toHaveLength(4);
    expect(result.scaledEntries.map((e: any) => e.scaleValue)).toContain(0);
  });

  it('keeps STRING ratings and drops only the genuinely empty one', () => {
    const { tournamentRecord, entries } = buildRecord(['12.48', '11.20', '10.05', ''], 'UTR');
    const result: any = getScaledEntries({
      scaleAttributes: { scaleType: RATING, scaleName: 'UTR', eventType: SINGLES },
      tournamentRecord: tournamentRecord as any,
      entries: entries as any,
    });
    expect(result.scaledEntries).toHaveLength(3);
  });

  it('sorts a zero to the correct end rather than to the fallback', () => {
    const { tournamentRecord, entries } = buildRecord([0, 500, 1200], 'PSA');
    const result: any = getScaledEntries({
      scaleAttributes: { scaleType: RATING, scaleName: 'PSA', eventType: SINGLES },
      tournamentRecord: tournamentRecord as any,
      entries: entries as any,
      sortDescending: true,
    });
    expect(result.scaledEntries.map((e: any) => e.scaleValue)).toEqual([1200, 500, 0]);
  });

  it('does not confuse a SEEDING scale with a RATING scale', () => {
    const { tournamentRecord, entries } = buildRecord([0, 500], 'PSA');
    const result: any = getScaledEntries({
      scaleAttributes: { scaleType: SEEDING, scaleName: 'PSA', eventType: SINGLES },
      tournamentRecord: tournamentRecord as any,
      entries: entries as any,
    });
    expect(result.scaledEntries).toHaveLength(0);
  });
});

describe('getAvgWTN — string ratings must average, not concatenate', () => {
  const sideWith = (participantId: string, wtnRating: string | number) => ({
    participant: {
      participantId,
      ratings: { [SINGLES]: [{ scaleName: 'WTN', scaleValue: { wtnRating, confidence: 90 } }] },
    },
  });

  const matchUpsFor = (a: string | number, b: string | number) =>
    [
      {
        drawId: 'd1',
        matchUpFormat: 'SET3-S:6/TB7',
        sides: [sideWith('a', a), sideWith('b', b)],
      },
    ] as any;

  it('averages STRING ratings instead of producing NaN', () => {
    // Before: totalWTN started at 0 and `+=` concatenated -> '04.135.20' -> NaN,
    // and that NaN reaches published structure reports.
    const result = getAvgWTN({ matchUps: matchUpsFor('4.13', '5.20'), eventType: SINGLES, drawId: 'd1' });
    expect(Number.isNaN(result.avgWTN)).toBe(false);
    expect(result.avgWTN).toBeCloseTo(4.665, 6);
    expect(result.pctNoRating).toBe(0);
  });

  it('agrees between the string and number representations', () => {
    const asStrings = getAvgWTN({ matchUps: matchUpsFor('4.13', '5.20'), eventType: SINGLES, drawId: 'd1' });
    const asNumbers = getAvgWTN({ matchUps: matchUpsFor(4.13, 5.2), eventType: SINGLES, drawId: 'd1' });
    expect(asStrings.avgWTN).toBeCloseTo(asNumbers.avgWTN, 10);
    expect(asStrings.avgConfidence).toBeCloseTo(asNumbers.avgConfidence, 10);
  });

  it('counts an empty-string rating as unrated rather than averaging it in', () => {
    const result = getAvgWTN({ matchUps: matchUpsFor('4.13', ''), eventType: SINGLES, drawId: 'd1' });
    expect(result.avgWTN).toBeCloseTo(4.13, 6);
    expect(result.pctNoRating).toBeCloseTo(50, 6);
  });
});
