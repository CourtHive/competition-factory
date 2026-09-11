import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

import { getEntryFeeRange, isIndeterminateFee, resolveEntryFee } from '@Query/entries/resolveEntryFee';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';

/**
 * Punch-list M1.
 *
 * `RegistrationEntryFee` carried a bare amount + currencyCode, so `{ amount: 6000, currencyCode:
 * 'USD' }` was readable as $60.00 or $6,000 with nothing to choose between them. Two shipped
 * renderers assumed whole units, which is a 100× error on the federation surfaces that state minor
 * units.
 *
 * These tests pin the two halves of the fix: writes require a unit, reads refuse to guess one.
 */

describe('resolveEntryFee — reads refuse to guess a scale', () => {
  it('resolves a fully-stated fee', () => {
    const result: any = resolveEntryFee({ amount: 6000, currencyCode: 'USD', unit: 'MINOR' });
    expect(isIndeterminateFee(result)).toBe(false);
    expect(result).toEqual({ amount: 6000, currencyCode: 'USD', unit: 'MINOR' });
  });

  it('reports INDETERMINATE for a fee with no unit rather than assuming one', () => {
    // The pre-change shape. It must not resolve to either scale.
    const result: any = resolveEntryFee({ amount: 6000, currencyCode: 'USD' } as any);
    expect(isIndeterminateFee(result)).toBe(true);
    expect(result.reason).toContain('unit');
  });

  it('does not invent a currency', () => {
    const result: any = resolveEntryFee({ amount: 60, unit: 'MAJOR' } as any);
    expect(isIndeterminateFee(result)).toBe(true);
    expect(result.reason).toContain('currencyCode');
  });

  it('never infers the unit from magnitude — 6000 is not "obviously" minor units', () => {
    // A genuine ¥6000 entry and a genuine $6,000 pro-am are both real; magnitude cannot separate
    // them, so a resolver that tried would be confidently wrong on one of the two.
    const yen: any = resolveEntryFee({ amount: 6000, currencyCode: 'JPY', unit: 'MAJOR' });
    const usd: any = resolveEntryFee({ amount: 6000, currencyCode: 'USD', unit: 'MINOR' });
    expect(yen.unit).toBe('MAJOR');
    expect(usd.unit).toBe('MINOR');
  });
});

describe('getEntryFeeRange — a range is only meaningful within one denomination', () => {
  it('computes a range over fees denominated alike', () => {
    const range: any = getEntryFeeRange([
      { amount: 7500, currencyCode: 'USD', unit: 'MINOR' },
      { amount: 9500, currencyCode: 'USD', unit: 'MINOR' },
    ]);
    expect(range.min.amount).toBe(7500);
    expect(range.max.amount).toBe(9500);
    expect(range.incomparable).toEqual([]);
  });

  it('does NOT pick the smaller number across currencies — it reports the mismatch', () => {
    // 40 EUR is a smaller NUMBER than 45 USD but not a known smaller VALUE. The pre-change
    // formatter sorted on amount alone and labelled the winner with its own currency.
    const range: any = getEntryFeeRange([
      { amount: 45, currencyCode: 'USD', unit: 'MAJOR' },
      { amount: 45, currencyCode: 'USD', unit: 'MAJOR' },
      { amount: 40, currencyCode: 'EUR', unit: 'MAJOR' },
    ]);
    expect(range.min.currencyCode).toBe('USD');
    expect(range.incomparable).toEqual(['EUR/MAJOR']);
  });

  it('discloses unit-less fees rather than dropping them', () => {
    const range: any = getEntryFeeRange([
      { amount: 7500, currencyCode: 'USD', unit: 'MINOR' },
      { amount: 9500, currencyCode: 'USD' } as any,
    ]);
    expect(range.min.amount).toBe(7500);
    expect(range.indeterminate).toHaveLength(1);
  });

  it('returns undefined when nothing resolves, so a caller renders nothing rather than zero', () => {
    expect(getEntryFeeRange([{ amount: 60 } as any])).toBeUndefined();
    expect(getEntryFeeRange([])).toBeUndefined();
  });
});

describe('setRegistrationProfile — writes are strict', () => {
  const seed = () => {
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 2 },
      nonRandom: 1,
    });
    tournamentEngine.setState(tournamentRecord);
    return tournamentRecord;
  };

  it('rejects an entry fee with no unit — the path previously validated nothing at all', () => {
    seed();
    const result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: { entryFees: [{ amount: 6000, currencyCode: 'USD' }] },
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('rejects an entry fee with no currencyCode', () => {
    seed();
    const result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: { entryFees: [{ amount: 6000, unit: 'MINOR' }] },
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('accepts a fully-stated fee and stores it', () => {
    seed();
    const result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: {
        entriesClose: '2026-06-01',
        entryFees: [{ amount: 6000, currencyCode: 'USD', unit: 'MINOR', eventType: 'SINGLES' }],
      },
    });
    expect(result.success).toBe(true);
    const { tournamentRecord: stored }: any = tournamentEngine.getTournament();
    expect(stored.registrationProfile.entryFees[0].unit).toBe('MINOR');
  });

  it('leaves a profile with no entryFees alone — the gate is narrow by design', () => {
    seed();
    const result: any = tournamentEngine.setRegistrationProfile({
      registrationProfile: { entriesClose: '2026-06-01', dressCode: 'whites' },
    });
    expect(result.success).toBe(true);
  });
});
