import { updatePracticeRegistration } from '@Mutate/practice/updatePracticeRegistration';
import { getPracticeRegistrations } from '@Query/practice/getPracticeRegistrations';
import { addPracticeRegistration } from '@Mutate/practice/addPracticeRegistration';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { CAPACITY_EXCEEDED } from '@Constants/errorConditionConstants';
import { PRACTICE } from '@Constants/scheduleConstants';

/**
 * FEATURE-033 — capacity is PEAK simultaneous occupancy, not the number of
 * registrations that merely overlap the requested window.
 *
 * Before the fix, capacity 2 with 14:00–15:00 and 15:00–16:00 booked refused a
 * 14:00–16:00 request although no instant ever held more than two people.
 */

const TEST_DATE = '2026-06-15';

type Ctx = {
  tournamentRecord: any;
  courtId: string;
  participantIds: string[];
};

function setup(opts?: { capacity?: number | null; defaultCapacity?: number | null }): Ctx {
  mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 8 },
    venueProfiles: [{ courtsCount: 1, venueId: 'v1' }],
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
  const booking: any = { bookingId: 'booking-1', bookingType: PRACTICE, startTime: '14:00', endTime: '16:00' };
  if (opts && 'capacity' in opts) booking.capacity = opts.capacity;
  court.dateAvailability = [{ date: TEST_DATE, startTime: '08:00', endTime: '20:00', bookings: [booking] }];

  return {
    tournamentRecord,
    courtId: court.courtId,
    participantIds: (tournamentRecord.participants ?? []).map((p: any) => p.participantId),
  };
}

function add(ctx: Ctx, index: number, startTime: string, endTime: string) {
  return addPracticeRegistration({
    tournamentRecord: ctx.tournamentRecord,
    participantId: ctx.participantIds[index],
    bookingId: 'booking-1',
    courtId: ctx.courtId,
    date: TEST_DATE,
    startTime,
    endTime,
  });
}

function registrationCount(ctx: Ctx, includeCancelled = false) {
  return getPracticeRegistrations({ tournamentRecord: ctx.tournamentRecord, includeCancelled }).registrations.length;
}

describe('practice capacity — peak simultaneous occupancy', () => {
  it('accepts a request spanning two adjacent registrations when no instant exceeds capacity', () => {
    const ctx = setup({ capacity: 2 });
    let result: any = add(ctx, 0, '14:00', '15:00');
    expect(result.success).toEqual(true);
    result = add(ctx, 1, '15:00', '16:00');
    expect(result.success).toEqual(true);

    result = add(ctx, 2, '14:00', '16:00');
    expect(result.success).toEqual(true);
    expect(registrationCount(ctx)).toEqual(3);
  });

  it('treats a departure and an arrival at the same time as non-coexisting', () => {
    const ctx = setup({ capacity: 1 });
    let result: any = add(ctx, 0, '14:00', '15:00');
    expect(result.success).toEqual(true);
    result = add(ctx, 1, '15:00', '16:00');
    expect(result.success).toEqual(true);
  });

  it('counts staggered pairs by their peak, not their total', () => {
    const ctx = setup({ capacity: 3 });
    for (const [i, [start, end]] of [
      ['14:00', '14:30'],
      ['14:15', '14:45'],
      ['15:00', '15:30'],
      ['15:15', '15:45'],
    ].entries()) {
      const result: any = add(ctx, i, start, end);
      expect(result.success).toEqual(true);
    }

    // Four overlap the window; at most two are ever present at once.
    const result: any = add(ctx, 4, '14:00', '16:00');
    expect(result.success).toEqual(true);
  });

  it('refuses a true overflow and writes nothing', () => {
    const ctx = setup({ capacity: 2 });
    let result: any = add(ctx, 0, '14:00', '15:00');
    expect(result.success).toEqual(true);
    result = add(ctx, 1, '14:30', '15:30');
    expect(result.success).toEqual(true);

    // 14:30–15:00 already holds two.
    result = add(ctx, 2, '14:00', '16:00');
    expect(result.error).toEqual(CAPACITY_EXCEEDED);
    expect(registrationCount(ctx, true)).toEqual(2);
  });

  it('ignores cancelled registrations when computing the peak', () => {
    const ctx = setup({ capacity: 2 });
    let result: any = add(ctx, 0, '14:00', '15:00');
    expect(result.success).toEqual(true);
    const cancelled: any = add(ctx, 1, '14:00', '15:00');
    expect(cancelled.success).toEqual(true);
    result = updatePracticeRegistration({
      tournamentRecord: ctx.tournamentRecord,
      registrationId: cancelled.registration.registrationId,
      updates: { status: 'CANCELLED' },
      bookingId: 'booking-1',
      courtId: ctx.courtId,
      date: TEST_DATE,
    });
    expect(result.success).toEqual(true);
    result = add(ctx, 2, '15:00', '16:00');
    expect(result.success).toEqual(true);

    result = add(ctx, 3, '14:00', '16:00');
    expect(result.success).toEqual(true);
  });

  it('an update excludes the registration being moved from its own peak', () => {
    const ctx = setup({ capacity: 2 });
    add(ctx, 0, '14:00', '15:00');
    add(ctx, 1, '15:00', '16:00');
    const moving: any = add(ctx, 2, '14:00', '16:00');
    expect(moving.success).toEqual(true);

    // Counting itself would make 14:00–15:00 hold three.
    let result: any = updatePracticeRegistration({
      tournamentRecord: ctx.tournamentRecord,
      registrationId: moving.registration.registrationId,
      updates: { startTime: '14:00', endTime: '15:30' },
      bookingId: 'booking-1',
      courtId: ctx.courtId,
      date: TEST_DATE,
    });
    expect(result.success).toEqual(true);
    expect(result.registration.endTime).toEqual('15:30');

    // With 15:30–16:00 also taken, 15:00–16:00 already holds two without it.
    add(ctx, 3, '15:30', '16:00');
    result = updatePracticeRegistration({
      tournamentRecord: ctx.tournamentRecord,
      registrationId: moving.registration.registrationId,
      updates: { startTime: '15:00', endTime: '16:00' },
      bookingId: 'booking-1',
      courtId: ctx.courtId,
      date: TEST_DATE,
    });
    expect(result.error).toEqual(CAPACITY_EXCEEDED);
    expect(moving.registration.startTime).toEqual('14:00');
  });

  it('keeps unlimited, closed and tournament-default semantics', () => {
    let ctx = setup({ capacity: null });
    for (let i = 0; i < 6; i += 1) {
      const result: any = add(ctx, i, '14:00', '16:00');
      expect(result.success).toEqual(true);
    }

    ctx = setup({ capacity: 0 });
    let result: any = add(ctx, 0, '14:00', '14:30');
    expect(result.error).toEqual(CAPACITY_EXCEEDED);
    expect(registrationCount(ctx, true)).toEqual(0);

    ctx = setup({ defaultCapacity: 1 });
    result = add(ctx, 0, '14:00', '15:00');
    expect(result.success).toEqual(true);
    result = add(ctx, 1, '15:00', '16:00');
    expect(result.success).toEqual(true);
    result = add(ctx, 2, '14:30', '15:30');
    expect(result.error).toEqual(CAPACITY_EXCEEDED);

    ctx = setup();
    for (let i = 0; i < 4; i += 1) {
      result = add(ctx, i, '14:00', '16:00');
      expect(result.success).toEqual(true);
    }
  });
});
