import { setSchemaWriteMode } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { afterEach, expect, it } from 'vitest';

// constants and types
import { OFFICIAL_CONFLICT_OF_INTEREST } from '@Constants/officiatingConstants';
import { LEGACY, NATIVE } from '@Constants/schemaWriteModeConstants';
import { SCHEDULE_LOCKED } from '@Constants/errorConditionConstants';
import { COMPLETED } from '@Constants/matchUpStatusConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { DOMINANT_DUO } from '@Constants/tieFormatConstants';
import { OFFICIAL } from '@Constants/participantRoles';
import { TEAM } from '@Constants/eventConstants';

// Fixtures
import { POLICY_OFFICIATING_CONFLICT_OF_INTEREST } from '@Fixtures/policies/POLICY_OFFICIATING_CONFLICT_OF_INTEREST';

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

  return {
    sides: matchUps[0].sides,
    lockedId: matchUps[0].matchUpId,
    otherId: matchUps[1].matchUpId,
    courts,
  };
}

/** An OFFICIAL participant, plus an officialRecord declaring a FAMILY tie to `participantId`. */
function addOfficial() {
  const { participant } = tournamentEngine.addParticipant({
    participant: {
      person: { standardFamilyName: 'Umpire', standardGivenName: 'Chair' },
      participantType: INDIVIDUAL,
      participantRole: OFFICIAL,
    },
    returnParticipant: true,
  });
  return participant.participantId;
}

const conflictedRecord = (participantId: string): any => ({
  conflictDeclarations: [{ declarationId: 'dec-1', participantId, relationship: 'FAMILY' }],
  certificationRequirements: [],
  officialRecordId: 'rec-001',
  personId: 'person-official',
  evaluationPolicies: [],
  certifications: [],
  createdAt: '2025-01-01',
  updatedAt: '2025-01-01',
  evaluations: [],
  assignments: [],
  suspensions: [],
});

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

  let result: any = clearAll({ matchUpIds: [lockedId, otherId] });
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

  let result: any = clearAll({ matchUpIds: [lockedId, otherId] });
  // one skipped, one cleared — not an error result
  expect(result.error).toBeUndefined();
  expect(result.scheduled).toEqual(1);
});

it('clears a locked placement when the caller overrides, and the lock survives the move', () => {
  const { lockedId } = seed();
  lock(lockedId);

  let result: any = clearAll({ matchUpIds: [lockedId], overrideScheduleLock: true });
  expect(result.success).toEqual(true);
  expect(result.lockedMatchUpIds).toBeUndefined();
  expect(scheduleOf(lockedId)?.scheduledTime).toBeUndefined();
  // the lock is not unwritten by an override — only setMatchUpScheduleLock removes it
  expect(scheduleOf(lockedId)?.lock).not.toBeUndefined();
});

it('refuses a single-matchUp placement change, naming the locked attributes', () => {
  const { lockedId, courts } = seed();
  lock(lockedId);

  let result: any = tournamentEngine.addMatchUpScheduleItems({
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

  let result: any = tournamentEngine.addMatchUpScheduleItems({
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

  let result: any = tournamentEngine.addMatchUpScheduleItems({
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
  let completion: any = tournamentEngine.setMatchUpStatus({ outcome, matchUpId: lockedId, drawId: DRAW_ID });
  // guard the guard: a rejected outcome would leave the matchUp TO_BE_PLAYED and
  // make the assertions below pass for the wrong reason
  expect(completion.success).toEqual(true);
  expect(scheduleOf(lockedId)?.lock).not.toBeUndefined();

  let result: any = clearAll({ matchUpIds: [lockedId], scheduleCompletedMatchUps: true });
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
  let result: any = tournamentEngine.addMatchUpScheduleItems({
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

  let result: any = tournamentEngine.clearScheduledMatchUps({ scheduledDates: [SCHEDULED_DATE] });
  expect(result.lockedMatchUpIds).toEqual([lockedId]);
  expect(scheduleOf(lockedId)?.scheduledTime).toEqual('19:00');
  expect(scheduleOf(otherId)?.scheduledTime).toBeUndefined();
});

it('survives clearMatchUpSchedule unless overridden', () => {
  const { lockedId } = seed();
  lock(lockedId);

  let blocked: any = tournamentEngine.clearMatchUpSchedule({ matchUpId: lockedId, drawId: DRAW_ID });
  expect(blocked.error).toEqual(SCHEDULE_LOCKED);

  let allowed: any = tournamentEngine.clearMatchUpSchedule({
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
  let courtChange: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { courtId: courts[3].courtId },
    matchUpId: lockedId,
    drawId: DRAW_ID,
  });
  expect(courtChange.error).toBeUndefined();

  // time is pinned
  let timeChange: any = tournamentEngine.addMatchUpScheduleItems({
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

  let result: any = clearAll({ matchUpIds: [lockedId] });
  expect(result.lockedMatchUpIds).toBeUndefined();
  expect(scheduleOf(lockedId)?.scheduledTime).toBeUndefined();
});

it('behaves identically in NATIVE, where placement is first-class', () => {
  setSchemaWriteMode(NATIVE);
  const { lockedId, otherId } = seed();
  lock(lockedId);

  let result: any = clearAll({ matchUpIds: [lockedId, otherId] });
  expect(result.lockedMatchUpIds).toEqual([lockedId]);
  expect(scheduleOf(lockedId)?.scheduledTime).toEqual('19:00');
  expect(scheduleOf(otherId)?.scheduledTime).toBeUndefined();
});

it('keeps the lock out of published views', () => {
  const { lockedId } = seed();
  lock(lockedId);

  let publishedSchedule = tournamentEngine
    .allTournamentMatchUps({ usePublishState: true })
    .matchUps.find((m: any) => m.matchUpId === lockedId)?.schedule;
  expect(publishedSchedule?.lock).toBeUndefined();
  // …while the operational view still carries it
  expect(scheduleOf(lockedId)?.lock).not.toBeUndefined();
});

it('assigns an official to a locked matchUp — an official is not a placement', () => {
  const { lockedId } = seed();
  lock(lockedId);

  let result: any = tournamentEngine.addMatchUpOfficial({
    participantId: addOfficial(),
    matchUpId: lockedId,
    drawId: DRAW_ID,
  });
  expect(result.error).toBeUndefined();
  expect(result.success).toEqual(true);
  expect(scheduleOf(lockedId)?.official).not.toBeUndefined();
  // the placement is untouched by the assignment
  expect(scheduleOf(lockedId)?.scheduledTime).toEqual('19:00');
});

it('reports an officiating conflict on a locked matchUp — the lock must not mask it', () => {
  // The conflict gate lives in addMatchUpOfficial, the lock guard in
  // addMatchUpScheduleItems. If a refactor ever merges those paths, a lock
  // refusal would return first and hide the conflict from a director who then
  // unlocks, retries, and meets a second refusal they were never warned about.
  const { lockedId, sides } = seed();
  lock(lockedId);

  let result: any = tournamentEngine.addMatchUpOfficial({
    policyDefinitions: POLICY_OFFICIATING_CONFLICT_OF_INTEREST,
    officialRecord: conflictedRecord(sides[0].participantId),
    participantId: addOfficial(),
    matchUpId: lockedId,
    drawId: DRAW_ID,
  });

  expect(result.error).toEqual(OFFICIAL_CONFLICT_OF_INTEREST);
  expect(result.error).not.toEqual(SCHEDULE_LOCKED);
  expect(result.conflicts).toHaveLength(1);
  // the conflict refusal wrote nothing, and the lock is unaffected
  expect(scheduleOf(lockedId)?.official).toBeUndefined();
  expect(scheduleOf(lockedId)?.lock).not.toBeUndefined();
});

it('pins allocated courts, comparing the allocation rather than the reference', () => {
  // Only TEAM matchUps carry `allocatedCourts` (the write-side spelling is
  // `courtIds`); a singles matchUp silently holds none. This is the one path
  // where the lock compares arrays, so it needs a TEAM draw to be real.
  const {
    drawIds: [teamDrawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: DOMINANT_DUO }],
    venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '21:00', venueId: VENUE_ID }],
    startDate: SCHEDULED_DATE,
    endDate: '2026-06-28',
    setState: true,
  });

  const courts = tournamentEngine.getVenuesAndCourts().courts;
  const teamMatchUpId = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m: any) => m.matchUpType === TEAM)?.matchUpId;
  const courtIds = [courts[0].courtId, courts[1].courtId];

  tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: SCHEDULED_DATE, courtIds },
    matchUpId: teamMatchUpId,
    drawId: teamDrawId,
  });
  // guard the guard: without a stored allocation the comparison below is vacuous
  expect(scheduleOf(teamMatchUpId)?.allocatedCourts?.length).toEqual(2);

  tournamentEngine.setMatchUpScheduleLock({ matchUpId: teamMatchUpId, drawId: teamDrawId, lock: {} });

  // the same allocation rewritten is not a move
  let unchanged: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { courtIds },
    matchUpId: teamMatchUpId,
    drawId: teamDrawId,
  });
  expect(unchanged.error).toBeUndefined();

  // a different allocation is
  let moved: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { courtIds: [courts[2].courtId] },
    matchUpId: teamMatchUpId,
    drawId: teamDrawId,
  });
  expect(moved.error).toEqual(SCHEDULE_LOCKED);
  expect(moved.info).toContain('allocatedCourts');
});

it('rejects a lock request that names no matchUp', () => {
  seed();
  let result: any = tournamentEngine.setMatchUpScheduleLock({ drawId: DRAW_ID, lock: {} });
  expect(result.error).not.toBeUndefined();
});

it('rejects a lock request for a matchUp that is not in the draw', () => {
  seed();
  let result: any = tournamentEngine.setMatchUpScheduleLock({
    matchUpId: 'no-such-matchUp',
    drawId: DRAW_ID,
    lock: {},
  });
  expect(result.error).not.toBeUndefined();
});

it('locks silently when notices are disabled', () => {
  const { lockedId } = seed();
  let result: any = tournamentEngine.setMatchUpScheduleLock({
    matchUpId: lockedId,
    disableNotice: true,
    drawId: DRAW_ID,
    lock: {},
  });
  expect(result.success).toEqual(true);
  expect(scheduleOf(lockedId)?.lock).not.toBeUndefined();
});
