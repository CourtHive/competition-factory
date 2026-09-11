import { updatePracticeRegistration } from '@Mutate/practice/updatePracticeRegistration';
import { removePracticeRegistration } from '@Mutate/practice/removePracticeRegistration';
import { detectParticipantConflicts } from '@Mutate/practice/detectConflicts';
import { addPracticeRegistration } from '@Mutate/practice/addPracticeRegistration';
import { findPracticeBooking } from '@Mutate/practice/findPracticeBooking';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants and types
import { PracticeRegistrationStatusEnum } from '@Types/tournamentTypes';
import * as factoryEnums from '@Types/enumExports';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { PRACTICE } from '@Constants/scheduleConstants';
import {
  BOOKING_NOT_FOUND,
  CAPACITY_EXCEEDED,
  COURT_NOT_FOUND,
  INVALID_VALUES,
  REGISTRATION_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/**
 * Coverage for the practice module's conflict detection and its parameter
 * guards — the two areas `practiceRegistration.test.ts` leaves open.
 *
 * `detectConflicts` carries two independent classes and the existing suite only
 * ever exercised the practice-registration one, so every predicate in the
 * matchUp path (completed, decided, unscheduled, other-day, other-participant,
 * window overlap, doubles individual ids) was unverified. The guards matter for
 * a different reason: they are single-line early returns, so a test that never
 * supplies a bad param leaves the `return` statement uncovered while the line
 * still reads as covered.
 *
 * Written ahead of TMX consuming this surface — the conflict payload is what
 * drives the warn-and-allow confirmModal, so a wrong predicate here becomes a
 * missing or spurious warning in front of a tournament director.
 */

const TEST_DATE = '2026-06-15';
const OTHER_DATE = '2026-06-16';

type Setup = {
  tournamentRecord: any;
  courtId: string;
  secondCourtId: string;
  bookingId: string;
  participantId: string;
  secondParticipantId: string;
};

function setup(opts?: { capacity?: number | null; drawProfiles?: any[]; participantsCount?: number }): Setup {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: opts?.participantsCount ?? 8 },
    venueProfiles: [{ courtsCount: 2, venueId: 'v1' }],
    ...(opts?.drawProfiles ? { drawProfiles: opts.drawProfiles } : {}),
    startDate: TEST_DATE,
    endDate: OTHER_DATE,
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();

  const courts = tournamentRecord.venues[0].courts;
  const booking = {
    bookingId: 'booking-1',
    bookingType: PRACTICE,
    startTime: '14:00',
    endTime: '16:00',
    capacity: opts?.capacity,
  };
  for (const court of courts) {
    court.dateAvailability = [{ date: TEST_DATE, startTime: '08:00', endTime: '20:00', bookings: [{ ...booking }] }];
  }

  const participants = tournamentRecord.participants ?? [];
  return {
    tournamentRecord,
    courtId: courts[0].courtId,
    secondCourtId: courts[1].courtId,
    bookingId: 'booking-1',
    participantId: participants[0]?.participantId,
    secondParticipantId: participants[1]?.participantId,
  };
}

/** Schedule the first matchUp of the seeded draw and return its ids + sides. */
function scheduleFirstMatchUp({ scheduledDate, scheduledTime }: { scheduledDate: string; scheduledTime: string }) {
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUp = matchUps.find((m: any) => m.sides?.every((s: any) => s.participantId));
  tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate, scheduledTime },
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  return { matchUp, tournamentRecord };
}

/** A tournament with one confirmed registration on court 1, for guard-path tests. */
function seeded() {
  const s = setup();
  const added: any = addPracticeRegistration({
    tournamentRecord: s.tournamentRecord,
    courtId: s.courtId,
    date: TEST_DATE,
    bookingId: s.bookingId,
    participantId: s.participantId,
    startTime: '14:00',
    endTime: '15:00',
  });
  return { ...s, registrationId: added.registration.registrationId };
}

const SINGLES_DRAW = [{ drawSize: 4, eventName: 'Singles' }];

describe('detectParticipantConflicts — matchUp class', () => {
  it('reports a scheduled matchUp whose time falls inside the practice window', () => {
    setup({ drawProfiles: SINGLES_DRAW });
    const { matchUp, tournamentRecord } = scheduleFirstMatchUp({
      scheduledDate: TEST_DATE,
      scheduledTime: '14:30',
    });
    const participantId = matchUp.sides[0].participantId;

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '16:00',
    });

    expect(conflicts.matchUps).toHaveLength(1);
    expect(conflicts.matchUps[0].matchUpId).toEqual(matchUp.matchUpId);
    expect(conflicts.matchUps[0].scheduledTime).toEqual('14:30');
    expect(conflicts.matchUps[0].scheduledDate).toEqual(TEST_DATE);
  });

  it('ignores a matchUp scheduled outside the window on the same day', () => {
    setup({ drawProfiles: SINGLES_DRAW });
    const { matchUp, tournamentRecord } = scheduleFirstMatchUp({
      scheduledDate: TEST_DATE,
      scheduledTime: '17:00',
    });

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId: matchUp.sides[0].participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '16:00',
    });

    expect(conflicts.matchUps).toEqual([]);
  });

  it('treats the window as half-open — a matchUp exactly at endTime is not a conflict', () => {
    setup({ drawProfiles: SINGLES_DRAW });
    const { matchUp, tournamentRecord } = scheduleFirstMatchUp({
      scheduledDate: TEST_DATE,
      scheduledTime: '16:00',
    });

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId: matchUp.sides[0].participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '16:00',
    });

    expect(conflicts.matchUps).toEqual([]);
  });

  it('counts a matchUp exactly at startTime — the boundary is inclusive at the start', () => {
    setup({ drawProfiles: SINGLES_DRAW });
    const { matchUp, tournamentRecord } = scheduleFirstMatchUp({
      scheduledDate: TEST_DATE,
      scheduledTime: '14:00',
    });

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId: matchUp.sides[0].participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '16:00',
    });

    expect(conflicts.matchUps).toHaveLength(1);
  });

  it('ignores a matchUp scheduled on a different day', () => {
    setup({ drawProfiles: SINGLES_DRAW });
    const { matchUp, tournamentRecord } = scheduleFirstMatchUp({
      scheduledDate: OTHER_DATE,
      scheduledTime: '14:30',
    });

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId: matchUp.sides[0].participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '16:00',
    });

    expect(conflicts.matchUps).toEqual([]);
  });

  it('ignores an unscheduled matchUp', () => {
    setup({ drawProfiles: SINGLES_DRAW });
    const { tournamentRecord } = tournamentEngine.getTournament();
    const { matchUps } = tournamentEngine.allTournamentMatchUps();
    const matchUp = matchUps.find((m: any) => m.sides?.every((s: any) => s.participantId));

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId: matchUp.sides[0].participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '16:00',
    });

    expect(conflicts.matchUps).toEqual([]);
  });

  it('ignores a completed matchUp — a played match cannot be a future conflict', () => {
    setup({ drawProfiles: SINGLES_DRAW });
    const { matchUp, tournamentRecord } = scheduleFirstMatchUp({
      scheduledDate: TEST_DATE,
      scheduledTime: '14:30',
    });
    const target = findMatchUp(tournamentRecord, matchUp.matchUpId);
    target.matchUpStatus = COMPLETED;

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId: matchUp.sides[0].participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '16:00',
    });

    expect(conflicts.matchUps).toEqual([]);
  });

  it('ignores a matchUp that already has a winningSide', () => {
    setup({ drawProfiles: SINGLES_DRAW });
    const { matchUp, tournamentRecord } = scheduleFirstMatchUp({
      scheduledDate: TEST_DATE,
      scheduledTime: '14:30',
    });
    const target = findMatchUp(tournamentRecord, matchUp.matchUpId);
    target.winningSide = 1;

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId: matchUp.sides[0].participantId,
      date: TEST_DATE,
      startTime: '14:30',
      endTime: '16:00',
    });

    expect(conflicts.matchUps).toEqual([]);
  });

  it('ignores a matchUp the participant is not playing in', () => {
    const { secondParticipantId } = setup({ drawProfiles: SINGLES_DRAW });
    const { matchUp, tournamentRecord } = scheduleFirstMatchUp({
      scheduledDate: TEST_DATE,
      scheduledTime: '14:30',
    });
    const playing = matchUp.sides.map((s: any) => s.participantId);
    const bystander = playing.includes(secondParticipantId)
      ? tournamentRecord.participants.find((p: any) => !playing.includes(p.participantId)).participantId
      : secondParticipantId;

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId: bystander,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '16:00',
    });

    expect(conflicts.matchUps).toEqual([]);
  });

  it('matches an individual playing a doubles matchUp via the side participant', () => {
    setup({ drawProfiles: [{ drawSize: 4, eventType: 'DOUBLES', eventName: 'Doubles' }] });
    const { matchUp, tournamentRecord } = scheduleFirstMatchUp({
      scheduledDate: TEST_DATE,
      scheduledTime: '14:30',
    });
    const individualId = matchUp.sides[0].participant?.individualParticipantIds?.[0];
    expect(individualId, 'doubles seed should expose individualParticipantIds').toBeDefined();

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId: individualId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '16:00',
    });

    expect(conflicts.matchUps).toHaveLength(1);
  });
});

describe('detectParticipantConflicts — practice-registration class', () => {
  it('finds a conflicting registration on a different court', () => {
    const { courtId, secondCourtId, bookingId, participantId, tournamentRecord } = setup();
    addPracticeRegistration({
      tournamentRecord,
      courtId: secondCourtId,
      date: TEST_DATE,
      bookingId,
      participantId,
      startTime: '14:00',
      endTime: '15:00',
    });

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId,
      date: TEST_DATE,
      startTime: '14:30',
      endTime: '15:30',
    });

    expect(conflicts.practiceRegistrations).toHaveLength(1);
    expect(conflicts.practiceRegistrations[0].courtId).toEqual(secondCourtId);
    expect(conflicts.practiceRegistrations[0].courtId).not.toEqual(courtId);
  });

  it('skips the registration named by excludeRegistrationId', () => {
    const { courtId, bookingId, participantId, tournamentRecord } = setup();
    const added: any = addPracticeRegistration({
      tournamentRecord,
      courtId,
      date: TEST_DATE,
      bookingId,
      participantId,
      startTime: '14:00',
      endTime: '15:00',
    });

    const withExclusion = detectParticipantConflicts({
      tournamentRecord,
      participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '15:00',
      excludeRegistrationId: added.registration.registrationId,
    });
    expect(withExclusion.practiceRegistrations).toEqual([]);

    // Control: without the exclusion the same call DOES report it, so the
    // assertion above is about the exclusion rather than about an empty state.
    const withoutExclusion = detectParticipantConflicts({
      tournamentRecord,
      participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '15:00',
    });
    expect(withoutExclusion.practiceRegistrations).toHaveLength(1);
  });

  it('ignores a CANCELLED registration', () => {
    const { courtId, bookingId, participantId, tournamentRecord } = setup();
    const added: any = addPracticeRegistration({
      tournamentRecord,
      courtId,
      date: TEST_DATE,
      bookingId,
      participantId,
      startTime: '14:00',
      endTime: '15:00',
    });
    updatePracticeRegistration({
      tournamentRecord,
      courtId,
      date: TEST_DATE,
      bookingId,
      registrationId: added.registration.registrationId,
      updates: { status: 'CANCELLED' },
    });

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '15:00',
    });

    expect(conflicts.practiceRegistrations).toEqual([]);
  });

  it('ignores a registration for a different participant', () => {
    const { courtId, bookingId, participantId, secondParticipantId, tournamentRecord } = setup();
    addPracticeRegistration({
      tournamentRecord,
      courtId,
      date: TEST_DATE,
      bookingId,
      participantId: secondParticipantId,
      startTime: '14:00',
      endTime: '15:00',
    });

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId,
      date: TEST_DATE,
      startTime: '14:00',
      endTime: '15:00',
    });

    expect(conflicts.practiceRegistrations).toEqual([]);
  });

  it('ignores registrations that abut the window without overlapping it', () => {
    const { courtId, bookingId, participantId, tournamentRecord } = setup();
    addPracticeRegistration({
      tournamentRecord,
      courtId,
      date: TEST_DATE,
      bookingId,
      participantId,
      startTime: '14:00',
      endTime: '15:00',
    });

    // Requested window starts exactly when the existing one ends.
    const after = detectParticipantConflicts({
      tournamentRecord,
      participantId,
      date: TEST_DATE,
      startTime: '15:00',
      endTime: '16:00',
    });
    expect(after.practiceRegistrations).toEqual([]);

    // ...and ends exactly when the existing one starts.
    const before = detectParticipantConflicts({
      tournamentRecord,
      participantId,
      date: TEST_DATE,
      startTime: '13:00',
      endTime: '14:00',
    });
    expect(before.practiceRegistrations).toEqual([]);
  });

  it('ignores registrations held on another date', () => {
    const { courtId, bookingId, participantId, tournamentRecord } = setup();
    addPracticeRegistration({
      tournamentRecord,
      courtId,
      date: TEST_DATE,
      bookingId,
      participantId,
      startTime: '14:00',
      endTime: '15:00',
    });

    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId,
      date: OTHER_DATE,
      startTime: '14:00',
      endTime: '15:00',
    });

    expect(conflicts.practiceRegistrations).toEqual([]);
  });
});

describe('updatePracticeRegistration — guards and remaining paths', () => {
  const guardCases: Array<[string, Record<string, any>]> = [
    ['date is missing', { date: undefined }],
    ['bookingId is missing', { bookingId: undefined }],
    ['registrationId is missing', { registrationId: undefined }],
    ['updates is empty', { updates: {} }],
    ['updates is absent', { updates: undefined }],
  ];

  it.each(guardCases)('rejects with INVALID_VALUES when %s', (_label, override) => {
    const s = seeded();
    const result: any = updatePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: s.registrationId,
      updates: { notes: 'x' },
      ...override,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('propagates BOOKING_NOT_FOUND from the booking lookup', () => {
    const s = seeded();
    const result: any = updatePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: 'no-such-booking',
      registrationId: s.registrationId,
      updates: { notes: 'x' },
    });
    expect(result.error).toEqual(BOOKING_NOT_FOUND);
  });

  it('returns REGISTRATION_NOT_FOUND for an unknown registrationId', () => {
    const s = seeded();
    const result: any = updatePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: 'no-such-registration',
      updates: { notes: 'x' },
    });
    expect(result.error).toEqual(REGISTRATION_NOT_FOUND);
  });

  it('rejects an update whose resulting startTime is not before its endTime', () => {
    const s = seeded();
    const result: any = updatePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: s.registrationId,
      updates: { startTime: '15:00', endTime: '14:00' },
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('rejects a re-time that would exceed capacity, and leaves the registration untouched', () => {
    const s = setup({ capacity: 1 });
    const first: any = addPracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      participantId: s.participantId,
      startTime: '14:00',
      endTime: '15:00',
    });
    // A second registration in a non-overlapping window fits under capacity 1.
    const second: any = addPracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      participantId: s.secondParticipantId,
      startTime: '15:00',
      endTime: '16:00',
    });
    expect(second.success).toEqual(true);

    // Moving it on top of the first one would put two in the same window.
    const result: any = updatePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: second.registration.registrationId,
      updates: { startTime: '14:00', endTime: '15:00' },
    });

    expect(result.error).toEqual(CAPACITY_EXCEEDED);
    expect(second.registration.startTime).toEqual('15:00');
    expect(first.registration.startTime).toEqual('14:00');
  });

  it('clears cancelledAt when a cancelled registration is reinstated', () => {
    const s = seeded();
    const cancelled: any = updatePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: s.registrationId,
      updates: { status: 'CANCELLED' },
      occurredAt: '2026-06-15T14:05:00.000Z',
    });
    expect(cancelled.registration.cancelledAt).toEqual('2026-06-15T14:05:00.000Z');

    const reinstated: any = updatePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: s.registrationId,
      updates: { status: 'CONFIRMED' },
    });

    expect(reinstated.success).toEqual(true);
    expect(reinstated.registration.status).toEqual('CONFIRMED');
    expect(reinstated.registration.cancelledAt).toBeUndefined();
  });

  it('writes notes and stamps updatedAt from occurredAt', () => {
    const s = seeded();
    const result: any = updatePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: s.registrationId,
      updates: { notes: 'left-handed partner requested' },
      occurredAt: '2026-06-15T14:10:00.000Z',
      disableNotice: true,
    });

    expect(result.registration.notes).toEqual('left-handed partner requested');
    expect(result.registration.updatedAt).toEqual('2026-06-15T14:10:00.000Z');
  });

  it('returns a conflicts payload alongside success when the new window collides', () => {
    const s = setup();
    const onCourtTwo: any = addPracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.secondCourtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      participantId: s.participantId,
      startTime: '14:00',
      endTime: '15:00',
    });
    expect(onCourtTwo.success).toEqual(true);

    const onCourtOne: any = addPracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      participantId: s.participantId,
      startTime: '15:00',
      endTime: '16:00',
    });

    const moved: any = updatePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: onCourtOne.registration.registrationId,
      updates: { startTime: '14:00', endTime: '15:00' },
    });

    expect(moved.success).toEqual(true);
    expect(moved.conflicts.practiceRegistrations).toHaveLength(1);
    expect(moved.conflicts.practiceRegistrations[0].courtId).toEqual(s.secondCourtId);
  });

  it('does not compute conflicts when the update cancels the registration', () => {
    const s = setup();
    addPracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.secondCourtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      participantId: s.participantId,
      startTime: '14:00',
      endTime: '15:00',
    });
    const overlapping: any = addPracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      participantId: s.participantId,
      startTime: '14:00',
      endTime: '15:00',
    });
    expect(overlapping.conflicts.practiceRegistrations).toHaveLength(1);

    const cancelled: any = updatePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: overlapping.registration.registrationId,
      updates: { status: 'CANCELLED' },
    });

    expect(cancelled.success).toEqual(true);
    expect(cancelled.conflicts).toBeUndefined();
  });
});

describe('removePracticeRegistration — guards', () => {
  const guardCases: Array<[string, Record<string, any>]> = [
    ['date is missing', { date: undefined }],
    ['bookingId is missing', { bookingId: undefined }],
    ['registrationId is missing', { registrationId: undefined }],
  ];

  it.each(guardCases)('rejects with INVALID_VALUES when %s', (_label, override) => {
    const s = seeded();
    const result: any = removePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: s.registrationId,
      ...override,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('propagates BOOKING_NOT_FOUND from the booking lookup', () => {
    const s = seeded();
    const result: any = removePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: 'no-such-booking',
      registrationId: s.registrationId,
    });
    expect(result.error).toEqual(BOOKING_NOT_FOUND);
  });

  it('suppresses the venue notice when disableNotice is set', () => {
    const s = seeded();
    const result: any = removePracticeRegistration({
      tournamentRecord: s.tournamentRecord,
      courtId: s.courtId,
      date: TEST_DATE,
      bookingId: s.bookingId,
      registrationId: s.registrationId,
      disableNotice: true,
      occurredAt: '2026-06-15T15:30:00.000Z',
    });

    expect(result.success).toEqual(true);
    const booking = s.tournamentRecord.venues[0].courts[0].dateAvailability[0].bookings[0];
    expect(booking.registrations).toEqual([]);
    expect(booking.updatedAt).toEqual('2026-06-15T15:30:00.000Z');
  });
});

describe('findPracticeBooking — lookup failures', () => {
  it('returns COURT_NOT_FOUND for an unknown courtId', () => {
    const { tournamentRecord } = setup();
    const result: any = findPracticeBooking({
      tournamentRecord,
      courtId: 'no-such-court',
      date: TEST_DATE,
      bookingId: 'booking-1',
    });
    expect(result.error).toEqual(COURT_NOT_FOUND);
  });

  it('returns BOOKING_NOT_FOUND when the court has no availability on that date', () => {
    const { tournamentRecord, courtId } = setup();
    const result: any = findPracticeBooking({
      tournamentRecord,
      courtId,
      date: OTHER_DATE,
      bookingId: 'booking-1',
    });
    expect(result.error).toEqual(BOOKING_NOT_FOUND);
  });

  it('ignores a non-PRACTICE booking that happens to carry the requested id', () => {
    const { tournamentRecord, courtId } = setup();
    tournamentRecord.venues[0].courts[0].dateAvailability[0].bookings = [
      { bookingId: 'booking-1', bookingType: 'MAINTENANCE', startTime: '14:00', endTime: '16:00' },
    ];
    const result: any = findPracticeBooking({
      tournamentRecord,
      courtId,
      date: TEST_DATE,
      bookingId: 'booking-1',
    });
    expect(result.error).toEqual(BOOKING_NOT_FOUND);
  });
});

/**
 * The registration-status vocabulary is carried by a single value-exported enum.
 *
 * It previously lived twice: a bare `'CONFIRMED' | 'CANCELLED'` type union plus a
 * hand-written `practiceConstants` module that nothing imported and that was never
 * added to the constants barrel. Because the union was not an enum it also sat outside
 * `enumConstConformance`'s registry, so no guard ever noticed the duplicate. These
 * assert the surface TMX will consume.
 */
describe('PracticeRegistrationStatusEnum — the single source for the status vocabulary', () => {
  it('is reachable as a runtime value, not merely a type', () => {
    // `src/index.ts` does `export type * from './types'`, which strips enum runtime
    // values; `types/enumExports.ts` is what re-exports them. A type-only enum would
    // leave a consumer destructuring `undefined`.
    expect(factoryEnums.PracticeRegistrationStatusEnum).toBeDefined();
    expect(factoryEnums.PracticeRegistrationStatusEnum).toBe(PracticeRegistrationStatusEnum);
  });

  it('carries exactly the statuses the registration flow writes', () => {
    const { tournamentRecord, courtId, bookingId, participantId } = setup();
    const added: any = addPracticeRegistration({
      tournamentRecord,
      courtId,
      date: TEST_DATE,
      bookingId,
      participantId,
      startTime: '14:00',
      endTime: '15:00',
    });
    expect(added.registration.status).toEqual(PracticeRegistrationStatusEnum.CONFIRMED);

    const cancelled: any = updatePracticeRegistration({
      tournamentRecord,
      courtId,
      date: TEST_DATE,
      bookingId,
      registrationId: added.registration.registrationId,
      updates: { status: PracticeRegistrationStatusEnum.CANCELLED },
    });
    expect(cancelled.registration.status).toEqual(PracticeRegistrationStatusEnum.CANCELLED);

    expect(Object.values(PracticeRegistrationStatusEnum).toSorted((a, b) => a.localeCompare(b))).toEqual([
      'CANCELLED',
      'CONFIRMED',
    ]);
  });
});

function findMatchUp(tournamentRecord: any, matchUpId: string): any {
  for (const event of tournamentRecord.events ?? []) {
    for (const drawDefinition of event.drawDefinitions ?? []) {
      for (const structure of drawDefinition.structures ?? []) {
        const found = structure.matchUps?.find((m: any) => m.matchUpId === matchUpId);
        if (found) return found;
      }
    }
  }
  return undefined;
}
