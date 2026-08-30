import { describe, expect, it } from 'vitest';

import { getEffectiveRegistrationProfile, getEventEntryFees } from '@Query/entries/getEffectiveRegistrationProfile';
import type { Event, Tournament } from '@Types/tournamentTypes';

/**
 * A2 and A3.
 *
 * The cascade test is the one that matters. `event.registrationProfile ?? tournament.registrationProfile`
 * is the obvious implementation and it is wrong in a way that looks right — it replaces the whole
 * object, so an event overriding one field silently loses every other. That is what these pin.
 */

const tournamentRecord = {
  tournamentId: 't',
  registrationProfile: {
    entriesOpen: '2026-05-01',
    entriesClose: '2026-06-01',
    withdrawalDeadline: '2026-06-05',
    entryUrl: 'https://example.test/enter',
    eligibilityNotes: 'Members only',
    entryFees: [{ amount: 5000, currencyCode: 'USD', unit: 'MAJOR' as const }],
    // tournament-wide by nature — must NOT appear in the effective event profile
    dressCode: 'whites',
    sponsors: [{ name: 'Acme' }],
  },
} as unknown as Tournament;

describe('getEffectiveRegistrationProfile — the cascade is field by field', () => {
  it('inherits everything when the event states nothing', () => {
    const event = { eventId: 'e' } as Event;
    const effective: any = getEffectiveRegistrationProfile({ event, tournamentRecord });
    expect(effective.entriesClose).toBe('2026-06-01');
    expect(effective.entryUrl).toBe('https://example.test/enter');
  });

  it('an event overriding ONE field keeps the tournament values for the rest', () => {
    // The whole point. Object-level fallback would drop entryUrl, entriesOpen and the fees.
    const event = { eventId: 'e', registrationProfile: { entriesClose: '2026-05-20' } } as Event;
    const effective: any = getEffectiveRegistrationProfile({ event, tournamentRecord });
    expect(effective.entriesClose).toBe('2026-05-20');
    expect(effective.entryUrl).toBe('https://example.test/enter');
    expect(effective.entriesOpen).toBe('2026-05-01');
    expect(effective.withdrawalDeadline).toBe('2026-06-05');
    expect(effective.entryFees).toHaveLength(1);
  });

  it('does not surface tournament-wide fields that are not event-scoped concepts', () => {
    const event = { eventId: 'e' } as Event;
    const effective: any = getEffectiveRegistrationProfile({ event, tournamentRecord });
    expect(effective.dressCode).toBeUndefined();
    expect(effective.sponsors).toBeUndefined();
  });

  it('undefined does not override, but null does', () => {
    // Absent means "not stated here"; null means "explicitly nothing".
    const undef = { eventId: 'e', registrationProfile: { entryUrl: undefined } } as Event;
    expect((getEffectiveRegistrationProfile({ event: undef, tournamentRecord }) as any).entryUrl).toBe(
      'https://example.test/enter',
    );

    const explicit = { eventId: 'e', registrationProfile: { entryUrl: null } } as unknown as Event;
    expect((getEffectiveRegistrationProfile({ event: explicit, tournamentRecord }) as any).entryUrl).toBeNull();
  });

  it('survives a missing event or tournament without throwing', () => {
    expect(getEffectiveRegistrationProfile({})).toBeDefined();
    expect(getEffectiveRegistrationProfile({ event: { eventId: 'e' } as Event })).toBeDefined();
  });
});

describe('getEventEntryFees — selectors, most specific first', () => {
  const record = {
    tournamentId: 't',
    registrationProfile: {
      entryFees: [
        { amount: 30, currencyCode: 'USD', unit: 'MAJOR' as const },
        { amount: 75, currencyCode: 'USD', unit: 'MAJOR' as const, eventType: 'DOUBLES' },
        { amount: 95, currencyCode: 'USD', unit: 'MAJOR' as const, eventId: 'open-doubles' },
      ],
    },
  } as unknown as Tournament;

  it('eventId beats eventType', () => {
    const event = { eventId: 'open-doubles', eventType: 'DOUBLES' } as Event;
    const fees: any = getEventEntryFees({ event, tournamentRecord: record });
    expect(fees).toHaveLength(1);
    expect(fees[0].amount).toBe(95);
  });

  it('eventType applies when no eventId-keyed fee exists', () => {
    const event = { eventId: 'over35-doubles', eventType: 'DOUBLES' } as Event;
    const fees: any = getEventEntryFees({ event, tournamentRecord: record });
    expect(fees).toHaveLength(1);
    expect(fees[0].amount).toBe(75);
  });

  it('an unselected fee is tournament-wide', () => {
    const event = { eventId: 'singles', eventType: 'SINGLES' } as Event;
    const fees: any = getEventEntryFees({ event, tournamentRecord: record });
    expect(fees).toHaveLength(1);
    expect(fees[0].amount).toBe(30);
  });

  it('does not return a fee keyed to a DIFFERENT event as a fallback', () => {
    const onlyOther = {
      tournamentId: 't',
      registrationProfile: {
        entryFees: [{ amount: 95, currencyCode: 'USD', unit: 'MAJOR' as const, eventId: 'other' }],
      },
    } as unknown as Tournament;
    const event = { eventId: 'mine', eventType: 'SINGLES' } as Event;
    expect(getEventEntryFees({ event, tournamentRecord: onlyOther })).toEqual([]);
  });

  it('reads a fee stated on the event itself', () => {
    const event = {
      eventId: 'e',
      eventType: 'SINGLES',
      registrationProfile: { entryFees: [{ amount: 60, currencyCode: 'USD', unit: 'MAJOR' as const }] },
    } as Event;
    const fees: any = getEventEntryFees({ event, tournamentRecord: record });
    expect(fees).toHaveLength(1);
    expect(fees[0].amount).toBe(60);
  });
});

describe('EventEntryProfile round-trips', () => {
  it('carries the selection process AND the scale it sorts on', () => {
    // "top down by ranking" and "top down by WTN" are different products; the method alone is
    // under-specified, which is why selectionScaleName exists.
    const event = {
      eventId: 'e',
      entryProfile: {
        entriesLimit: 64,
        targetDrawSize: 64,
        selectionProcess: 'TOP_DOWN_BY_RATING' as const,
        selectionScaleName: 'WTN',
        wildcardCount: 4,
        waitlistEnabled: true,
      },
    } as Event;
    expect(event.entryProfile?.selectionProcess).toBe('TOP_DOWN_BY_RATING');
    expect(event.entryProfile?.selectionScaleName).toBe('WTN');
    expect(event.entryProfile?.entriesLimit).toBe(64);
  });
});
