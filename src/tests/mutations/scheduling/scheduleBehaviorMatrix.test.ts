import { writeModeMatrix } from '../../testHarness/writeModeMatrix';
import { getMatchUpIds } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * Behavioral scheduling coverage across NATIVE / DUAL / LEGACY. These assert *behavior* via engine
 * queries (does scheduling place matchUps, are they date/court-queryable), NOT the storage shape —
 * so one body holds in every writeMode. Storage-shape specifics live in the LEGACY originals +
 * `*.native.test.ts` siblings. See planning/NATIVE_WRITEMODE_COVERAGE.md.
 */

writeModeMatrix((mode) => {
  it(`scheduleMatchUps places matchUps that are date-queryable (${mode})`, () => {
    const startDate = '2020-01-01';
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      venueProfiles: [{ courtsCount: 3 }],
      drawProfiles: [{ drawSize: 16 }],
      startDate,
    });
    tournamentEngine.setState(tournamentRecord);
    const matchUpIds = getMatchUpIds(tournamentEngine.getCompetitionMatchUps().upcomingMatchUps);

    const result = tournamentEngine.scheduleMatchUps({ scheduleDate: startDate, matchUpIds });
    expect(result.success).toEqual(true);
    const scheduledCount = result.scheduledMatchUpIds.length;
    expect(scheduledCount).toBeGreaterThan(0);

    const dateMatchUps = tournamentEngine.competitionScheduleMatchUps({
      matchUpFilters: { scheduledDate: startDate },
    }).dateMatchUps;
    expect(dateMatchUps.length).toEqual(scheduledCount);
  });

  it(`addMatchUpScheduleItems placement is court-queryable (${mode})`, () => {
    const drawId = 'drawId';
    mocksEngine.generateTournamentRecord({
      setState: true,
      venueProfiles: [{ courtsCount: 4, venueId: 'venueId' }],
      drawProfiles: [{ drawId, drawSize: 8 }],
      startDate: '2026-06-22',
      endDate: '2026-06-28',
    });
    const courtId = tournamentEngine.getVenuesAndCourts().courts[2].courtId;
    const target = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.sides?.every((s) => s.participant));

    tournamentEngine.addMatchUpScheduleItems({
      drawId,
      matchUpId: target.matchUpId,
      schedule: { scheduledDate: '2026-06-22', scheduledTime: '10:00', venueId: 'venueId', courtId },
    });

    expect(tournamentEngine.allTournamentMatchUps({ matchUpFilters: { courtIds: [courtId] } }).matchUps.length).toEqual(
      1,
    );
    const inContext = tournamentEngine.allTournamentMatchUps().matchUps.find((m) => m.matchUpId === target.matchUpId);
    expect(inContext.schedule.courtId).toEqual(courtId);
    expect(inContext.schedule.scheduledDate).toEqual('2026-06-22');
  });
});
