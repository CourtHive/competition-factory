import { addPracticeRegistration } from '@Mutate/practice/addPracticeRegistration';
import { updatePracticeRegistration } from '@Mutate/practice/updatePracticeRegistration';
import { removePracticeRegistration } from '@Mutate/practice/removePracticeRegistration';
import { addDrawDefinitionTimeItem } from '@Mutate/drawDefinitions/addDrawDefinitionTimeItem';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { addExtension } from '@Mutate/extensions/addExtension';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { PRACTICE } from '@Constants/scheduleConstants';

/**
 * `occurredAt` coverage for the remaining venue-fact mutations.
 *
 * Same contract everywhere: a supplied value is recorded verbatim, and omitting
 * it still stamps from the clock so no existing caller changes behaviour. Both
 * directions are asserted — a one-directional test would pass against an
 * implementation that ignored the parameter entirely.
 *
 * See `Mentat/planning/DISCONNECTED_SYNC_RECONCILIATION.md` §4.1 and the D1/D2
 * decisions recorded there.
 */

const OCCURRED = '2026-06-15T14:05:00.000Z';
const TEST_DATE = '2026-06-15';

function seedPracticeBooking() {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 4 },
    venueProfiles: [{ courtsCount: 2, venueId: 'v1' }],
    startDate: TEST_DATE,
    endDate: TEST_DATE,
    nonRandom: 1,
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const court = tournamentRecord.venues[0].courts[0];
  court.dateAvailability = [
    {
      date: TEST_DATE,
      startTime: '08:00',
      endTime: '20:00',
      bookings: [{ bookingId: 'booking-1', bookingType: PRACTICE, startTime: '14:00', endTime: '16:00' }],
    },
  ];
  const participants = tournamentRecord.participants ?? [];
  return {
    tournamentRecord,
    courtId: court.courtId,
    bookingId: 'booking-1',
    participantId: participants[0]?.participantId,
  };
}

function bookingOf(setup: any) {
  const court = setup.tournamentRecord.venues[0].courts.find((c: any) => c.courtId === setup.courtId);
  return court.dateAvailability[0].bookings[0];
}

function register(setup: any, occurredAt?: string) {
  return addPracticeRegistration({
    tournamentRecord: setup.tournamentRecord,
    courtId: setup.courtId,
    date: TEST_DATE,
    bookingId: setup.bookingId,
    participantId: setup.participantId,
    startTime: '14:00',
    endTime: '14:30',
    registrationId: 'reg-fixed',
    ...(occurredAt ? { occurredAt } : {}),
  }) as any;
}

describe('addPracticeRegistration — occurredAt', () => {
  it('stamps registeredAt, createdAt and booking.updatedAt from one supplied value', () => {
    // One resolved value for the whole mutation — three separate new Date()
    // calls could otherwise differ for a single logical event.
    const setup = seedPracticeBooking();
    const result = register(setup, OCCURRED);

    expect(result.success).toEqual(true);
    expect(result.registration.registeredAt).toEqual(OCCURRED);
    expect(result.registration.createdAt).toEqual(OCCURRED);
    expect(bookingOf(setup).updatedAt).toEqual(OCCURRED);
  });

  it('defaults to now when omitted', () => {
    const setup = seedPracticeBooking();
    const before = Date.now();
    const result = register(setup);

    expect(result.success).toEqual(true);
    expect(new Date(result.registration.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('updatePracticeRegistration — occurredAt', () => {
  it('stamps updatedAt and cancelledAt from the supplied value', () => {
    const setup = seedPracticeBooking();
    register(setup);

    const result: any = updatePracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      registrationId: 'reg-fixed',
      updates: { status: 'CANCELLED' },
      occurredAt: OCCURRED,
    });

    expect(result.error).toBeUndefined();
    expect(result.registration.cancelledAt).toEqual(OCCURRED);
    expect(result.registration.updatedAt).toEqual(OCCURRED);
  });

  it('defaults to now when omitted', () => {
    const setup = seedPracticeBooking();
    register(setup);
    const before = Date.now();

    const result: any = updatePracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      registrationId: 'reg-fixed',
      updates: { status: 'CANCELLED' },
    });

    expect(new Date(result.registration.updatedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('removePracticeRegistration — occurredAt', () => {
  it('stamps booking.updatedAt from the supplied value, and from now when omitted', () => {
    const supplied = seedPracticeBooking();
    register(supplied);
    removePracticeRegistration({
      tournamentRecord: supplied.tournamentRecord,
      courtId: supplied.courtId,
      date: TEST_DATE,
      bookingId: supplied.bookingId,
      registrationId: 'reg-fixed',
      occurredAt: OCCURRED,
    });
    expect(bookingOf(supplied).updatedAt).toEqual(OCCURRED);

    const defaulted = seedPracticeBooking();
    register(defaulted);
    const before = Date.now();
    removePracticeRegistration({
      tournamentRecord: defaulted.tournamentRecord,
      courtId: defaulted.courtId,
      date: TEST_DATE,
      bookingId: defaulted.bookingId,
      registrationId: 'reg-fixed',
    });
    expect(new Date(bookingOf(defaulted).updatedAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('createMatchUp — occurredAt', () => {
  it('records the supplied value, and defaults to now when omitted', () => {
    const supplied = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7', occurredAt: OCCURRED });
    expect(supplied.createdAt).toEqual(OCCURRED);

    const before = Date.now();
    const defaulted = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
    expect(new Date(defaulted.createdAt as string).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('addDrawDefinitionTimeItem — supplied createdAt', () => {
  it('honours a createdAt on the caller timeItem, and stamps when absent', () => {
    const drawDefinition: any = { drawId: 'd1' };

    addDrawDefinitionTimeItem({
      drawDefinition,
      timeItem: { itemType: 'TEST', itemValue: 'supplied', createdAt: OCCURRED },
    });
    expect(drawDefinition.timeItems.at(-1).createdAt).toEqual(OCCURRED);

    const before = Date.now();
    addDrawDefinitionTimeItem({ drawDefinition, timeItem: { itemType: 'TEST', itemValue: 'minted' } });
    expect(new Date(drawDefinition.timeItems.at(-1).createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});

describe('addExtension — supplied createdAt', () => {
  it('honours a createdAt on the caller extension, and stamps when absent', () => {
    const supplied: any = { extensions: [] };
    addExtension({ element: supplied, extension: { name: 'x', value: 1, createdAt: OCCURRED } as any });
    expect(supplied.extensions.at(-1).createdAt).toEqual(OCCURRED);

    const defaulted: any = { extensions: [] };
    const before = Date.now();
    addExtension({ element: defaulted, extension: { name: 'y', value: 2 } });
    expect(new Date(defaulted.extensions.at(-1).createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });

  it('creationTime:false still adds no createdAt', () => {
    const element: any = { extensions: [] };
    addExtension({ element, extension: { name: 'z', value: 3 }, creationTime: false });
    expect(element.extensions.at(-1).createdAt).toBeUndefined();
  });
});

describe('otherIds and court-grid bookings — occurredAt', () => {
  it('addPersonOtherId stamps createdAt on insert and updatedAt on upsert', () => {
    mocksEngine.generateTournamentRecord({
      participantsProfile: { participantsCount: 2 },
      nonRandom: 1,
      setState: true,
    });
    const { participants } = tournamentEngine.getParticipants();
    const participantId = participants.find((p: any) => p.person)?.participantId;

    tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'ORG',
      personId: 'p-1',
      occurredAt: OCCURRED,
    });
    let person = tournamentEngine
      .getParticipants()
      .participants.find((p: any) => p.participantId === participantId).person;
    expect(person.personOtherIds.at(-1).createdAt).toEqual(OCCURRED);

    // Upsert path: same organisationId, different personId → updatedAt.
    tournamentEngine.addPersonOtherId({
      participantId,
      organisationId: 'ORG',
      personId: 'p-2',
      occurredAt: OCCURRED,
    });
    person = tournamentEngine.getParticipants().participants.find((p: any) => p.participantId === participantId).person;
    expect(person.personOtherIds.at(-1).updatedAt).toEqual(OCCURRED);
  });

  it('addVenueOtherId stamps createdAt from the supplied value', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 1, venueId: 'v1' }],
      nonRandom: 1,
      setState: true,
    });

    const result: any = tournamentEngine.addVenueOtherId({
      venueId: 'v1',
      organisationId: 'ORG',
      otherVenueId: 'other-1',
      occurredAt: OCCURRED,
    });
    expect(result.error).toBeUndefined();

    const { tournamentRecord } = tournamentEngine.getTournament();
    const venue = tournamentRecord.venues.find((v: any) => v.venueId === 'v1');
    expect(venue.venueOtherIds.at(-1).createdAt).toEqual(OCCURRED);
  });

  it('addCourtGridBooking stamps createdAt from the supplied value, and now when omitted', () => {
    mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 1, venueId: 'v1' }],
      startDate: TEST_DATE,
      endDate: TEST_DATE,
      nonRandom: 1,
      setState: true,
    });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const courtId = tournamentRecord.venues[0].courts[0].courtId;

    const supplied: any = tournamentEngine.addCourtGridBooking({
      courtId,
      scheduledDate: TEST_DATE,
      bookingType: PRACTICE,
      courtOrder: 1,
      occurredAt: OCCURRED,
    });
    expect(supplied.error).toBeUndefined();
    expect(supplied.booking.createdAt).toEqual(OCCURRED);

    const before = Date.now();
    const defaulted: any = tournamentEngine.addCourtGridBooking({
      courtId,
      scheduledDate: TEST_DATE,
      bookingType: PRACTICE,
      courtOrder: 5,
    });
    expect(new Date(defaulted.booking.createdAt).getTime()).toBeGreaterThanOrEqual(before - 1000);
  });
});
