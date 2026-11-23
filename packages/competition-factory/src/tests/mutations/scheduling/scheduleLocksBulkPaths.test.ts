import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// Constants
import { SCHEDULE_LOCKED } from '@Constants/errorConditionConstants';

// A schedule lock is respected by every path that moves a placement (CA, 2026-10-16: "schedule locks should always be
// respected"). bulkRescheduleMatchUps and reorderUpcomingMatchUps moved locked matchUps; a date change cleared the court
// of a matchUp whose lock pinned only its court.

const startDate = '2024-01-15';
const endDate = '2024-01-20';

function setup() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 2 }],
    drawProfiles: [{ drawSize: 8 }],
    startDate,
    endDate,
  });
  tournamentEngine.setState(tournamentRecord);

  const { courts } = tournamentEngine.getVenuesAndCourts();
  const matchUps = tournamentEngine
    .allTournamentMatchUps()
    .matchUps.filter(({ roundNumber }) => roundNumber === 1)
    .sort((a, b) => a.roundPosition - b.roundPosition);
  const schedule = (matchUpId) => tournamentEngine.findMatchUp({ matchUpId, inContext: true }).matchUp.schedule ?? {};

  return { courts, matchUps, schedule };
}

it('a date change does not clear the court of a matchUp whose lock pins its court', () => {
  const { courts, matchUps, schedule } = setup();
  const [{ matchUpId, drawId }] = matchUps;
  const { courtId, venueId } = courts[0];

  let result: any = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: startDate, courtId, venueId, courtOrder: 1 },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.setMatchUpScheduleLock({ lock: { attributes: ['courtId'] }, matchUpId, drawId });
  expect(result.success).toEqual(true);

  // moving the day would leave the court behind: the lock refuses it
  result = tournamentEngine.addMatchUpScheduleItems({ schedule: { scheduledDate: '2024-01-16' }, matchUpId, drawId });
  expect(result.error).toEqual(SCHEDULE_LOCKED);
  expect(schedule(matchUpId)).toMatchObject({ scheduledDate: startDate, courtId, courtOrder: 1 });

  // a confirmed move overrides it
  result = tournamentEngine.addMatchUpScheduleItems({
    schedule: { scheduledDate: '2024-01-16' },
    overrideScheduleLock: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(schedule(matchUpId).scheduledDate).toEqual('2024-01-16');
  expect(schedule(matchUpId).courtId).toBeUndefined();
});

it('bulkRescheduleMatchUps skips a locked matchUp and reports it', () => {
  const { matchUps, schedule } = setup();
  const matchUpIds = matchUps.slice(0, 2).map(({ matchUpId }) => matchUpId);
  for (const [index, { matchUpId, drawId }] of matchUps.slice(0, 2).entries()) {
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: startDate, scheduledTime: `${10 + index}:00` },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  const [locked, free] = matchUps;
  let result: any = tournamentEngine.setMatchUpScheduleLock({
    lock: { reason: 'featured' },
    matchUpId: locked.matchUpId,
    drawId: locked.drawId,
  });
  expect(result.success).toEqual(true);

  // a dry run reports the lock without writing
  result = tournamentEngine.bulkRescheduleMatchUps({ scheduleChange: { minutesChange: 30 }, matchUpIds, dryRun: true });
  expect(result.lockedMatchUpIds).toEqual([locked.matchUpId]);
  expect(schedule(free.matchUpId).scheduledTime).toEqual('11:00');

  result = tournamentEngine.bulkRescheduleMatchUps({ scheduleChange: { minutesChange: 30 }, matchUpIds });
  expect(result.success).toEqual(true);
  expect(result.lockedMatchUpIds).toEqual([locked.matchUpId]);
  expect(result.notRescheduled.map(({ matchUpId }) => matchUpId)).toEqual([locked.matchUpId]);
  expect(schedule(locked.matchUpId).scheduledTime).toEqual('10:00');
  expect(schedule(free.matchUpId).scheduledTime).toEqual('11:30');

  // the override moves it and keeps the lock
  result = tournamentEngine.bulkRescheduleMatchUps({
    matchUpIds: [locked.matchUpId],
    scheduleChange: { minutesChange: 30 },
    overrideScheduleLock: true,
  });
  expect(result.lockedMatchUpIds).toBeUndefined();
  expect(schedule(locked.matchUpId).scheduledTime).toEqual('10:30');
  expect(schedule(locked.matchUpId).lock).toBeDefined();
});

it('reorderUpcomingMatchUps does not rotate a locked time', () => {
  const { matchUps, schedule } = setup();
  const reordered = matchUps.slice(0, 3);
  for (const [index, { matchUpId, drawId }] of reordered.entries()) {
    const result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: startDate, scheduledTime: `${10 + index}:00` },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  let result: any = tournamentEngine.setMatchUpScheduleLock({
    lock: { attributes: ['scheduledTime'] },
    matchUpId: reordered[1].matchUpId,
    drawId: reordered[1].drawId,
  });
  expect(result.success).toEqual(true);

  const matchUpsContextIds = reordered.map(
    ({ matchUpId }) => tournamentEngine.findMatchUp({ matchUpId, inContext: true }).matchUp,
  );
  result = tournamentEngine.reorderUpcomingMatchUps({ matchUpsContextIds, firstToLast: true });
  expect(result.error).toEqual(SCHEDULE_LOCKED);
  expect(result.context?.lockedMatchUpIds).toEqual([reordered[1].matchUpId]);
  expect(reordered.map(({ matchUpId }) => schedule(matchUpId).scheduledTime)).toEqual(['10:00', '11:00', '12:00']);

  result = tournamentEngine.reorderUpcomingMatchUps({
    matchUpsContextIds,
    firstToLast: true,
    overrideScheduleLock: true,
  });
  expect(result.success).toEqual(true);
  expect(reordered.map(({ matchUpId }) => schedule(matchUpId).scheduledTime)).not.toEqual(['10:00', '11:00', '12:00']);
});
