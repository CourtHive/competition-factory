import { setSchemaWriteMode } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

import { LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';
import { SCHEDULE_LOCKED } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * Schedule locks — a director pins a marquee matchUp's placement so bulk and
 * automated scheduling cannot move it.
 *
 * The suite-wide setup hook pins LEGACY (placement in `timeItems[]`); production
 * runs NATIVE (first-class `matchUp.schedule.*`). The lock predicate reads both
 * surfaces, so the mode-parity test below is the one that would catch a
 * first-class-only regression.
 */

afterEach(() => setSchemaWriteMode(LEGACY));

const DRAW_ID = 'drawId';
const SCHEDULED_DATE = '2026-06-22';
const VENUE_ID = 'venueId';

function seed() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '21:00', venueId: VENUE_ID }],
    drawProfiles: [{ drawId: DRAW_ID, drawSize: 8 }],
    startDate: SCHEDULED_DATE,
    endDate: '2026-06-28',
    setState: true,
  });

  const courts = tournamentEngine.getVenuesAndCourts().courts;
  const matchUps = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter((m: any) => m.roundNumber === 1 && m.sides?.every((s: any) => s.participant));

  const place = (matchUpId: string, courtIndex: number, scheduledTime: string) =>
    tournamentEngine.addMatchUpScheduleItems({
      schedule: {
        scheduledDate: SCHEDULED_DATE,
        scheduledTime,
        venueId: VENUE_ID,
        courtId: courts[courtIndex].courtId,
      },
      matchUpId,
      drawId: DRAW_ID,
    });

  place(matchUps[0].matchUpId, 0, '19:00');
  place(matchUps[1].matchUpId, 1, '10:00');

  return { lockedId: matchUps[0].matchUpId, otherId: matchUps[1].matchUpId, courts };
}

const lock = (matchUpId: string, lockValue: any = { reason: 'featured' }) =>
  tournamentEngine.setMatchUpScheduleLock({ matchUpId, drawId: DRAW_ID, lock: lockValue });

const scheduleOf = (matchUpId: string) =>
  tournamentEngine.allTournamentMatchUps().matchUps.find((m: any) => m.matchUpId === matchUpId)?.schedule;

const clearAll = (params: any = {}) =>
  tournamentEngine.bulkScheduleMatchUps({
    schedule: { courtId: '', scheduledDate: '', courtOrder: '', scheduledTime: '', venueId: '' },
    removePriorValues: true,
    ...params,
  });

it('preserves a locked placement through a bulk clear and reports what it kept', () => {
  const { lockedId, otherId } = seed();
  lock(lockedId);

  const result: any = clearAll({ matchUpIds: [lockedId, otherId] });
  expect(result.success).toEqual(true);
  expect(result.lockedMatchUpIds).toEqual([lockedId]);

  // the locked matchUp keeps its placement; the unlocked one is cleared
  expect(scheduleOf(lockedId)?.scheduledTime).toEqual('19:00');
  expect(scheduleOf(lockedId)?.courtId).not.toBeUndefined();
  expect(scheduleOf(otherId)?.scheduledTime).toBeUndefined();
  expect(scheduleOf(otherId)?.courtId).toBeUndefined();
});

it('a locked matchUp never aborts the clear of its neighbours', () => {
  const { lockedId, otherId } = seed();
  lock(lockedId);

  const result: any = clearAll({ matchUpIds: [lockedId, otherId] });
  // one skipped, one cleared — not an error result
  expect(result.error).toBeUndefined();
  expect(result.scheduled).toEqual(1);
});

it('clears a locked placement when the caller overrides, and the lock survives the move', () => {
  const { lockedId } = seed();
  lock(lockedId);

  const result: any = clearAll({ matchUpIds: [lockedId], overrideScheduleLock: true });
  expect(result.success).toEqual(true);
  expect(result.lockedMatchUpIds).toBeUndefined();
  expect(scheduleOf(lockedId)?.scheduledTime).toBeUndefined();
  // the lock is not unwritten by an override — only setMatchUpScheduleLock removes it
  expect(scheduleOf(lockedId)?.lock).not.toBeUndefined();
});

it('refuses a single-matchUp placement change, naming the locked attributes', () => {
  const { lockedId, courts } = seed();
  lock(lockedId);

  const result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledTime: '11:00', courtId: courts[3].courtId },
    matchUpId: lockedId,
    drawId: DRAW_ID,
  });
  expect(result.error).toEqual(SCHEDULE_LOCKED);
  expect(result.info).toContain('scheduledTime');
  expect(scheduleOf(lockedId)?.scheduledTime).toEqual('19:00');
});

it('permits actual-play attributes on a locked matchUp — a pinned match must still be playable', () => {
  const { lockedId } = seed();
  lock(lockedId);

  const result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { startTime: '2026-06-22T19:04:00.000Z' },
    matchUpId: lockedId,
    drawId: DRAW_ID,
  });
  expect(result.error).toBeUndefined();
  expect(result.success).toEqual(true);
});

it('permits a no-op rewrite of the same placement values', () => {
  const { lockedId, courts } = seed();
  lock(lockedId);

  const result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: SCHEDULED_DATE, scheduledTime: '19:00', courtId: courts[0].courtId },
    matchUpId: lockedId,
    drawId: DRAW_ID,
  });
  expect(result.error).toBeUndefined();
});

it('releases the lock lazily once the matchUp reaches a completed status', () => {
  const { lockedId } = seed();
  lock(lockedId);

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: COMPLETED,
    scoreString: '6-1 6-1',
    winningSide: 1,
  });
  const completion: any = tournamentEngine.setMatchUpStatus({ outcome, matchUpId: lockedId, drawId: DRAW_ID });
  // guard the guard: a rejected outcome would leave the matchUp TO_BE_PLAYED and
  // make the assertions below pass for the wrong reason
  expect(completion.success).toEqual(true);
  expect(scheduleOf(lockedId)?.lock).not.toBeUndefined();

  const result: any = clearAll({ matchUpIds: [lockedId], scheduleCompletedMatchUps: true });
  expect(result.lockedMatchUpIds).toBeUndefined();
  expect(scheduleOf(lockedId)?.scheduledTime).toBeUndefined();
});

it('an unscheduled matchUp is not made unschedulable by a leftover lock', () => {
  const { lockedId, courts } = seed();
  lock(lockedId);
  clearAll({ matchUpIds: [lockedId], overrideScheduleLock: true });

  // the lock object is still on the record, but with no placement to guard it
  // must not silently block the matchUp from being scheduled again
  expect(scheduleOf(lockedId)?.lock).not.toBeUndefined();
  const result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: SCHEDULED_DATE, scheduledTime: '14:00', courtId: courts[2].courtId },
    matchUpId: lockedId,
    drawId: DRAW_ID,
  });
  expect(result.error).toBeUndefined();
  expect(scheduleOf(lockedId)?.scheduledTime).toEqual('14:00');
});

it('survives clearScheduledMatchUps, the date-scoped clear the schedulers use', () => {
  const { lockedId, otherId } = seed();
  lock(lockedId);

  const result: any = tournamentEngine.clearScheduledMatchUps({ scheduledDates: [SCHEDULED_DATE] });
  expect(result.lockedMatchUpIds).toEqual([lockedId]);
  expect(scheduleOf(lockedId)?.scheduledTime).toEqual('19:00');
  expect(scheduleOf(otherId)?.scheduledTime).toBeUndefined();
});

it('survives clearMatchUpSchedule unless overridden', () => {
  const { lockedId } = seed();
  lock(lockedId);

  const blocked: any = tournamentEngine.clearMatchUpSchedule({ matchUpId: lockedId, drawId: DRAW_ID });
  expect(blocked.error).toEqual(SCHEDULE_LOCKED);

  const allowed: any = tournamentEngine.clearMatchUpSchedule({
    overrideScheduleLock: true,
    matchUpId: lockedId,
    drawId: DRAW_ID,
  });
  expect(allowed.success).toEqual(true);
});

it('a partial lock guards only the attributes it names', () => {
  const { lockedId, courts } = seed();
  lock(lockedId, { attributes: ['scheduledTime'] });

  // court is not pinned — reassigning it is permitted
  const courtChange: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { courtId: courts[3].courtId },
    matchUpId: lockedId,
    drawId: DRAW_ID,
  });
  expect(courtChange.error).toBeUndefined();

  // time is pinned
  const timeChange: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledTime: '08:30' },
    matchUpId: lockedId,
    drawId: DRAW_ID,
  });
  expect(timeChange.error).toEqual(SCHEDULE_LOCKED);
});

it('rejects an invalid lock shape', () => {
  const { lockedId } = seed();
  expect(lock(lockedId, { attributes: ['courtId', 'nonsense'] }).error).not.toBeUndefined();
  expect(lock(lockedId, 'yes').error).not.toBeUndefined();
});

it('unlocks with a null lock', () => {
  const { lockedId } = seed();
  lock(lockedId);
  expect(scheduleOf(lockedId)?.lock).not.toBeUndefined();

  tournamentEngine.setMatchUpScheduleLock({ matchUpId: lockedId, drawId: DRAW_ID, lock: null });
  expect(scheduleOf(lockedId)?.lock).toBeUndefined();

  const result: any = clearAll({ matchUpIds: [lockedId] });
  expect(result.lockedMatchUpIds).toBeUndefined();
  expect(scheduleOf(lockedId)?.scheduledTime).toBeUndefined();
});

it('behaves identically in NATIVE, where placement is first-class', () => {
  setSchemaWriteMode(NATIVE);
  const { lockedId, otherId } = seed();
  lock(lockedId);

  const result: any = clearAll({ matchUpIds: [lockedId, otherId] });
  expect(result.lockedMatchUpIds).toEqual([lockedId]);
  expect(scheduleOf(lockedId)?.scheduledTime).toEqual('19:00');
  expect(scheduleOf(otherId)?.scheduledTime).toBeUndefined();
});

it('keeps the lock out of published views', () => {
  const { lockedId } = seed();
  lock(lockedId);

  const publishedSchedule = tournamentEngine
    .allTournamentMatchUps({ usePublishState: true })
    .matchUps.find((m: any) => m.matchUpId === lockedId)?.schedule;
  expect(publishedSchedule?.lock).toBeUndefined();
  // …while the operational view still carries it
  expect(scheduleOf(lockedId)?.lock).not.toBeUndefined();
});
