import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

/**
 * The direct scheduler applies the daily limits of a matchUp's tournament (scheduling-pipeline.md § 3.5, § 6 rule 5),
 * as the profile pipelines do: a tournament's own limits, and the call's `matchUpDailyLimits` only where a tournament
 * states none.
 */
it('scheduleMatchUps applies the tournament’s own daily limits', () => {
  const startDate = '2026-10-01';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 4 }, { drawSize: 4 }],
    participantsProfile: { participantsCount: 4 },
    venueProfiles: [{ courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
    endDate: startDate,
    setState: true,
    startDate,
  });
  let result: any = tournamentEngine.setMatchUpDailyLimits({ dailyLimits: { SINGLES: 1 } });
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } });
  // every participant plays one first-round matchUp in each draw: a limit of one singles leaves half unplaced
  result = tournamentEngine.scheduleMatchUps({
    matchUpIds: matchUps.map(({ matchUpId }) => matchUpId),
    scheduleDate: startDate,
  });
  expect(result.success).toEqual(true);
  expect(result.scheduledMatchUpIds.length).toEqual(2);
  expect(result.overLimitMatchUpIds.length).toEqual(2);
});
