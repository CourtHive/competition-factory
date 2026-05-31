import { setPracticeDefaultCapacity } from '@Mutate/practice/setPracticeDefaultCapacity';
import { updatePracticeRegistration } from '@Mutate/practice/updatePracticeRegistration';
import { removePracticeRegistration } from '@Mutate/practice/removePracticeRegistration';
import { addPracticeRegistration } from '@Mutate/practice/addPracticeRegistration';
import { getPracticeRegistrations } from '@Query/practice/getPracticeRegistrations';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import {
  BOOKING_NOT_FOUND,
  CAPACITY_EXCEEDED,
  INVALID_VALUES,
  MISSING_PARTICIPANT_ID,
  PARTICIPANT_NOT_FOUND,
  REGISTRATION_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import { PRACTICE } from '@Constants/scheduleConstants';

const TEST_DATE = '2026-06-15';

type Setup = {
  tournamentRecord: any;
  courtId: string;
  bookingId: string;
  participantId: string;
  secondParticipantId: string;
};

function setupPracticeBooking(opts?: {
  capacity?: number | null;
  defaultCapacity?: number | null;
  bookings?: any[];
  participantsCount?: number;
}): Setup {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: opts?.participantsCount ?? 4 },
    venueProfiles: [{ courtsCount: 2, venueId: 'v1' }],
    startDate: TEST_DATE,
    endDate: TEST_DATE,
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();

  if (opts?.defaultCapacity !== undefined) {
    tournamentRecord.scheduling ??= {};
    tournamentRecord.scheduling.practice = { defaultCapacity: opts.defaultCapacity };
  }

  const court = tournamentRecord.venues[0].courts[0];
  const courtId = court.courtId;
  const defaultBooking = {
    bookingId: 'booking-1',
    bookingType: PRACTICE,
    startTime: '14:00',
    endTime: '16:00',
    capacity: opts?.capacity,
  };
  const bookings = opts?.bookings ?? [defaultBooking];
  court.dateAvailability = [
    {
      date: TEST_DATE,
      startTime: '08:00',
      endTime: '20:00',
      bookings,
    },
  ];

  const participants = tournamentRecord.participants ?? [];
  return {
    tournamentRecord,
    courtId,
    bookingId: bookings[0].bookingId ?? 'booking-1',
    participantId: participants[0]?.participantId,
    secondParticipantId: participants[1]?.participantId,
  };
}

describe('addPracticeRegistration', () => {
  it('confirms a registration inside the booking window with no capacity set', () => {
    const setup = setupPracticeBooking();
    const result: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(result.success).toEqual(true);
    expect(result.registration?.status).toEqual('CONFIRMED');
    expect(result.registration?.participantId).toEqual(setup.participantId);
  });

  it('rejects when participantId is missing', () => {
    const setup = setupPracticeBooking();
    const result: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: undefined as any,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(result.error).toEqual(MISSING_PARTICIPANT_ID);
  });

  it('rejects when participantId does not exist in tournament', () => {
    const setup = setupPracticeBooking();
    const result: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: 'p-not-real',
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(result.error).toEqual(PARTICIPANT_NOT_FOUND);
  });

  it('rejects sub-window outside booking window', () => {
    const setup = setupPracticeBooking();
    const result: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '13:00',
      endTime: '14:30',
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('rejects when startTime is not before endTime', () => {
    const setup = setupPracticeBooking();
    const result: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:30',
      endTime: '14:30',
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('enforces per-booking capacity as hard reject', () => {
    const setup = setupPracticeBooking({ capacity: 1 });
    const first: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(first.success).toEqual(true);

    const second: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.secondParticipantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(second.error).toEqual(CAPACITY_EXCEEDED);
  });

  it('uses tournament defaultCapacity when per-booking capacity is unset', () => {
    const setup = setupPracticeBooking({ defaultCapacity: 1 });
    const first: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(first.success).toEqual(true);

    const second: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.secondParticipantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(second.error).toEqual(CAPACITY_EXCEEDED);
  });

  it('per-booking capacity overrides the tournament default', () => {
    const setup = setupPracticeBooking({ capacity: 2, defaultCapacity: 1 });
    const a: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(a.success).toEqual(true);

    const b: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.secondParticipantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(b.success).toEqual(true);
  });

  it('treats capacity 0 as closed', () => {
    const setup = setupPracticeBooking({ capacity: 0 });
    const result: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(result.error).toEqual(CAPACITY_EXCEEDED);
  });

  it('finds bookings by deterministic id when bookingId is unset (legacy backfill)', () => {
    const setup = setupPracticeBooking({
      bookings: [{ bookingType: PRACTICE, startTime: '14:00', endTime: '16:00' }],
    });
    const derivedId = `${setup.courtId}-${TEST_DATE}-14:00`;
    const result: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: derivedId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(result.success).toEqual(true);
    const booking = setup.tournamentRecord.venues[0].courts[0].dateAvailability[0].bookings[0];
    expect(booking.bookingId).toEqual(derivedId);
  });

  it('returns BOOKING_NOT_FOUND for unknown bookingId', () => {
    const setup = setupPracticeBooking();
    const result: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: 'nope',
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(result.error).toEqual(BOOKING_NOT_FOUND);
  });

  it('reports a participant practice conflict in the payload without blocking the new registration', () => {
    const setup = setupPracticeBooking();
    // Add second PRACTICE booking on the second court at an overlapping time
    const secondCourt = setup.tournamentRecord.venues[0].courts[1];
    secondCourt.dateAvailability = [
      {
        date: TEST_DATE,
        startTime: '08:00',
        endTime: '20:00',
        bookings: [{ bookingId: 'booking-2', bookingType: PRACTICE, startTime: '14:00', endTime: '16:00' }],
      },
    ];

    const first: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: secondCourt.courtId,
      date: TEST_DATE,
      bookingId: 'booking-2',
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(first.success).toEqual(true);

    const second: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:15',
      endTime: '14:45',
    });
    expect(second.success).toEqual(true);
    expect(second.conflicts?.practiceRegistrations?.length).toEqual(1);
  });
});

describe('removePracticeRegistration', () => {
  it('removes an existing registration', () => {
    const setup = setupPracticeBooking();
    const added: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    const removed: any = removePracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      registrationId: added.registration.registrationId,
    });
    expect(removed.success).toEqual(true);
    const booking = setup.tournamentRecord.venues[0].courts[0].dateAvailability[0].bookings[0];
    expect(booking.registrations?.length ?? 0).toEqual(0);
  });

  it('returns REGISTRATION_NOT_FOUND when registrationId is unknown', () => {
    const setup = setupPracticeBooking();
    const result: any = removePracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      registrationId: 'reg-nope',
    });
    expect(result.error).toEqual(REGISTRATION_NOT_FOUND);
  });
});

describe('updatePracticeRegistration', () => {
  it('flips status to CANCELLED and stamps cancelledAt', () => {
    const setup = setupPracticeBooking();
    const added: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    const updated: any = updatePracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      registrationId: added.registration.registrationId,
      updates: { status: 'CANCELLED' },
    });
    expect(updated.success).toEqual(true);
    expect(updated.registration?.status).toEqual('CANCELLED');
    expect(updated.registration?.cancelledAt).toBeDefined();
  });

  it('frees capacity when a registration is cancelled', () => {
    const setup = setupPracticeBooking({ capacity: 1 });
    const a: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    updatePracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      registrationId: a.registration.registrationId,
      updates: { status: 'CANCELLED' },
    });
    const b: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.secondParticipantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(b.success).toEqual(true);
  });

  it('rejects an update that pushes the sub-window outside the booking', () => {
    const setup = setupPracticeBooking();
    const a: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    const updated: any = updatePracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      registrationId: a.registration.registrationId,
      updates: { endTime: '17:00' },
    });
    expect(updated.error).toEqual(INVALID_VALUES);
  });
});

describe('getPracticeRegistrations', () => {
  it('returns confirmed registrations filtered by participantId and excludes cancelled by default', () => {
    const setup = setupPracticeBooking();
    const a: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.secondParticipantId,
      startTime: '14:30',
      endTime: '15:00',
    });
    updatePracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      registrationId: a.registration.registrationId,
      updates: { status: 'CANCELLED' },
    });

    const onlySecond = getPracticeRegistrations({
      tournamentRecord: setup.tournamentRecord,
      participantId: setup.secondParticipantId,
    });
    expect(onlySecond.registrations.length).toEqual(1);

    const allConfirmed = getPracticeRegistrations({
      tournamentRecord: setup.tournamentRecord,
    });
    expect(allConfirmed.registrations.length).toEqual(1);

    const includingCancelled = getPracticeRegistrations({
      tournamentRecord: setup.tournamentRecord,
      includeCancelled: true,
    });
    expect(includingCancelled.registrations.length).toEqual(2);
  });

  it('returns empty when tournamentRecord is missing', () => {
    const result = getPracticeRegistrations({ tournamentRecord: undefined as any });
    expect(result.registrations).toEqual([]);
  });
});

describe('setPracticeDefaultCapacity', () => {
  it('writes the default capacity onto tournament.scheduling.practice', () => {
    const setup = setupPracticeBooking();
    const result: any = setPracticeDefaultCapacity({
      tournamentRecord: setup.tournamentRecord,
      defaultCapacity: 4,
    });
    expect(result.success).toEqual(true);
    expect(setup.tournamentRecord.scheduling.practice.defaultCapacity).toEqual(4);
  });

  it('accepts null to unset the default (unlimited)', () => {
    const setup = setupPracticeBooking({ defaultCapacity: 2 });
    const result: any = setPracticeDefaultCapacity({
      tournamentRecord: setup.tournamentRecord,
      defaultCapacity: null,
    });
    expect(result.success).toEqual(true);
    expect(setup.tournamentRecord.scheduling.practice.defaultCapacity).toBeNull();
  });

  it('accepts 0 (closed)', () => {
    const setup = setupPracticeBooking();
    const result: any = setPracticeDefaultCapacity({
      tournamentRecord: setup.tournamentRecord,
      defaultCapacity: 0,
    });
    expect(result.success).toEqual(true);
    expect(setup.tournamentRecord.scheduling.practice.defaultCapacity).toEqual(0);
  });

  it('rejects negative or fractional values', () => {
    const setup = setupPracticeBooking();
    const negative: any = setPracticeDefaultCapacity({
      tournamentRecord: setup.tournamentRecord,
      defaultCapacity: -1,
    });
    expect(negative.error).toEqual(INVALID_VALUES);

    const fractional: any = setPracticeDefaultCapacity({
      tournamentRecord: setup.tournamentRecord,
      defaultCapacity: 1.5,
    });
    expect(fractional.error).toEqual(INVALID_VALUES);
  });

  it('changes downstream addPracticeRegistration capacity behavior', () => {
    const setup = setupPracticeBooking();
    setPracticeDefaultCapacity({ tournamentRecord: setup.tournamentRecord, defaultCapacity: 1 });

    const first: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(first.success).toEqual(true);

    const second: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.secondParticipantId,
      startTime: '14:00',
      endTime: '14:30',
    });
    expect(second.error).toEqual(CAPACITY_EXCEEDED);
  });
});
