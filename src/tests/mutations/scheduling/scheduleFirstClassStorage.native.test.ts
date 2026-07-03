import { getMatchUpIds } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * NATIVE-writeMode sibling of the LEGACY schedule specs (scheduleMatchUps / scheduleMatchUps2 /
 * scheduleMatchUps assertions on `matchUp.timeItems[]`). Runs under vitest.native.config.mts
 * (`pnpm test:native`), where the default NATIVE writeMode is active. Asserts the first-class
 * storage contract production actually writes: schedule data lands on `matchUp.schedule.*` with
 * NO `SCHEDULE.*` timeItem mirror. The LEGACY originals keep asserting the timeItem shape.
 *
 * See planning/NATIVE_WRITEMODE_COVERAGE.md.
 */

const scheduleTimeItemTypes = (matchUp: any) =>
  (matchUp.timeItems ?? []).map((t: any) => t.itemType).filter((t: string) => t?.startsWith('SCHEDULE'));

it('addMatchUpScheduleItems writes schedule first-class (no SCHEDULE.* timeItems)', () => {
  const drawId = 'drawId';
  const venueProfiles = [{ courtsCount: 4, startTime: '08:00', endTime: '21:00', venueId: 'venueId' }];
  mocksEngine.generateTournamentRecord({
    setState: true,
    venueProfiles,
    drawProfiles: [{ drawId, drawSize: 8 }],
    startDate: '2026-06-22',
    endDate: '2026-06-28',
  });
  const courts = tournamentEngine.getVenuesAndCourts().courts;
  const target = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.sides?.every((s) => s.participant));

  const result = tournamentEngine.addMatchUpScheduleItems({
    drawId,
    matchUpId: target.matchUpId,
    schedule: {
      scheduledDate: '2026-06-22',
      scheduledTime: '10:00',
      venueId: 'venueId',
      courtId: courts[2].courtId,
      courtOrder: 3,
    },
  });
  expect(result.success).toEqual(true);

  const rec = tournamentEngine.getTournament().tournamentRecord;
  const raw = rec.events[0].drawDefinitions[0].structures[0].matchUps.find(
    (m: any) => m.matchUpId === target.matchUpId,
  );

  // first-class storage, no timeItem mirror
  expect(raw.schedule.scheduledDate).toEqual('2026-06-22');
  expect(raw.schedule.courtId).toEqual(courts[2].courtId);
  expect(raw.schedule.venueId).toEqual('venueId');
  expect(raw.schedule.courtOrder).toEqual(3);
  expect(scheduleTimeItemTypes(raw)).toEqual([]);

  // and the value is queryable back through the (now first-class-aware) readers
  const inContext = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === target.matchUpId);
  expect(inContext.schedule.courtId).toEqual(courts[2].courtId);
  expect(
    tournamentEngine.allTournamentMatchUps({ matchUpFilters: { courtIds: [courts[2].courtId] } }).matchUps.length,
  ).toEqual(1);
});

it('scheduleMatchUps (bulk) writes scheduledTime + venueId first-class and is date-queryable', () => {
  const startDate = '2020-01-01';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    venueProfiles: [{ courtsCount: 3 }],
    drawProfiles: [{ drawSize: 16 }],
    startDate,
  });
  tournamentEngine.setState(tournamentRecord);
  const { upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps();
  const matchUpIds = getMatchUpIds(upcomingMatchUps);

  const result = tournamentEngine.scheduleMatchUps({ scheduleDate: startDate, matchUpIds });
  expect(result.success).toEqual(true);
  const scheduledCount = result.scheduledMatchUpIds.length;
  expect(scheduledCount).toBeGreaterThan(0);

  const rec = tournamentEngine.getTournament().tournamentRecord;
  const scheduled = rec.events[0].drawDefinitions[0].structures[0].matchUps.find((m: any) => m.schedule?.scheduledTime);
  expect(scheduled.schedule.scheduledTime).toContain(startDate); // ISO carries the date
  expect(scheduled.schedule.venueId).toBeDefined();
  expect(scheduleTimeItemTypes(scheduled)).toEqual([]);

  // date filtering (the query that returned 0 before the reader fix) now resolves the first-class time
  const dateMatchUps = tournamentEngine.competitionScheduleMatchUps({
    matchUpFilters: { scheduledDate: startDate },
  }).dateMatchUps;
  expect(dateMatchUps.length).toEqual(scheduledCount);
});
