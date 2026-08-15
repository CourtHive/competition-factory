import { addPracticeRegistration } from '@Mutate/practice/addPracticeRegistration';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import { PRACTICE } from '@Constants/scheduleConstants';

/**
 * A caller-supplied `registrationId` must be honoured rather than overwritten by
 * an engine-minted `UUID('reg')`.
 *
 * See `src/tests/sanctioning/sanctioningSuppliedIds.test.ts` for why this class
 * of change matters: a mutation that mints its own id is not replayable, because
 * a site server mirrors `{ method, params }` upstream and the cloud would mint a
 * different id than the origin did.
 *
 * Deliberately kept in a separate file from `practiceRegistration.test.ts` so no
 * existing test logic is altered.
 */

const TEST_DATE = '2026-06-15';

function setupPracticeBooking() {
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
    secondParticipantId: participants[1]?.participantId,
  };
}

describe('addPracticeRegistration — supplied registrationId', () => {
  it('uses the supplied registrationId verbatim', () => {
    const setup = setupPracticeBooking();
    const result: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
      registrationId: 'reg-supplied-1',
    });

    expect(result.success).toEqual(true);
    expect(result.registration?.registrationId).toEqual('reg-supplied-1');
  });

  it('does not re-prefix a supplied id', () => {
    // The mint path prefixes with 'reg'; a supplied id must round-trip unchanged
    // so an id read back off a record can be replayed as-is.
    const setup = setupPracticeBooking();
    const result: any = addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
      registrationId: 'externally-owned-id',
    });

    expect(result.registration?.registrationId).toEqual('externally-owned-id');
    expect(result.registration?.registrationId.startsWith('reg_')).toEqual(false);
  });

  it('persists the supplied id onto the booking, not just the result', () => {
    const setup = setupPracticeBooking();
    addPracticeRegistration({
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      participantId: setup.participantId,
      startTime: '14:00',
      endTime: '14:30',
      registrationId: 'reg-on-record',
    });

    const court = setup.tournamentRecord.venues[0].courts.find((c: any) => c.courtId === setup.courtId);
    const booking = court.dateAvailability[0].bookings[0];
    expect(booking.registrations.map((r: any) => r.registrationId)).toEqual(['reg-on-record']);
  });

  it('still mints a prefixed id when none is supplied', () => {
    // The negative direction — without this, an implementation that ignored the
    // parameter entirely would still pass the assertions above only by accident.
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
    expect(result.registration?.registrationId.startsWith('reg_')).toEqual(true);
  });

  it('keeps supplied ids distinct across registrations', () => {
    const setup = setupPracticeBooking();
    const common = {
      tournamentRecord: setup.tournamentRecord,
      courtId: setup.courtId,
      date: TEST_DATE,
      bookingId: setup.bookingId,
      startTime: '14:00',
      endTime: '14:30',
    };
    addPracticeRegistration({ ...common, participantId: setup.participantId, registrationId: 'reg-1' });
    addPracticeRegistration({ ...common, participantId: setup.secondParticipantId, registrationId: 'reg-2' });

    const court = setup.tournamentRecord.venues[0].courts.find((c: any) => c.courtId === setup.courtId);
    const booking = court.dateAvailability[0].bookings[0];
    expect(booking.registrations.map((r: any) => r.registrationId)).toEqual(['reg-1', 'reg-2']);
  });
});
