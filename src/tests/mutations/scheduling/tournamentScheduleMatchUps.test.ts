import { getMatchUpIds } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { MATCHUPS_SCHEDULED_OUTSIDE_DATES } from '@Constants/errorConditionConstants';

it('auto schedules venue if only one venue provided', () => {
  const drawProfiles = [{ drawSize: 16 }, { drawSize: 64 }];
  const venueProfiles = [{ courtsCount: 3 }];

  let startDate = '2020-01-01';
  const { tournamentRecord, venueIds } = mocksEngine.generateTournamentRecord({
    venueProfiles,
    drawProfiles,
    startDate,
  });

  tournamentEngine.setState(tournamentRecord);
  tournamentEngine.setState([tournamentRecord]);
  let { upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps();

  const matchUpIds = getMatchUpIds(upcomingMatchUps);
  expect(matchUpIds.length).toBeGreaterThan(0);

  let result = tournamentEngine.scheduleMatchUps({
    scheduleDate: startDate,
    matchUpIds,
  });
  expect(result.success).toEqual(true);
  const scheduledMatchUpsCount = result.scheduledMatchUpIds.length;

  const matchUpFilters = { scheduledDate: startDate };
  result = tournamentEngine.competitionScheduleMatchUps({ matchUpFilters });
  expect(result.dateMatchUps.length).toEqual(scheduledMatchUpsCount);

  ({ upcomingMatchUps } = tournamentEngine.getCompetitionMatchUps());
  const { matchUpId } = upcomingMatchUps[0];

  expect(upcomingMatchUps[0].schedule.venueId).toEqual(venueIds[0]);
  expect(matchUpIds.includes(matchUpId)).toEqual(true);

  // moving the start date past the scheduled matchUps is blocked (not silently unscheduled)
  startDate = '2020-01-02';
  result = tournamentEngine.setTournamentStartDate({ startDate });
  expect(result.error.code).toEqual(MATCHUPS_SCHEDULED_OUTSIDE_DATES.code);
  expect(result.outOfRangeMatchUpIds.length).toEqual(scheduledMatchUpsCount);

  // matchUps remain scheduled on the original date
  result = tournamentEngine.competitionScheduleMatchUps({ matchUpFilters });
  expect(result.dateMatchUps.length).toEqual(scheduledMatchUpsCount);
});
