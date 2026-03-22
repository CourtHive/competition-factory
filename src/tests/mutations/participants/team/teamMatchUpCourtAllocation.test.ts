import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import queryEngine from '@Engines/queryEngine';
import { unique } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants
import { FACTORY } from '@Constants/extensionConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

test('it can allocate courts to a TEAM matchUp', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 8 }],
    venueProfiles: [{ courtsCount: 6 }],
    startDate: '2023-03-15',
    endDate: '2023-03-22',
  });

  tournamentEngine.setState(tournamentRecord);

  const teamMatchUps = queryEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
  }).matchUps;
  const teamMatchUp = teamMatchUps[0];
  const { matchUpId, tournamentId, drawId } = teamMatchUp;

  const { courts } = queryEngine.getVenuesAndCourts();
  const courtIds = courts.map(({ courtId }) => courtId);

  let result = tournamentEngine.allocateTeamMatchUpCourts({
    matchUpId,
    courtIds,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.findMatchUp({ matchUpId });
  const { allocatedCourts } = result.matchUp.schedule;
  expect(allocatedCourts.map(({ courtId }) => courtId)).toEqual(courtIds);

  result = tournamentEngine.allocateTeamMatchUpCourts({
    removePriorValues: true,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.findMatchUp({ matchUpId });
  expect(result.matchUp.schedule.allocatedCourts).toEqual(undefined);
  expect(result.matchUp.timeItems).toEqual(undefined);

  const scheduledDate = '2023-03-17';
  result = tournamentEngine.setMatchUpStatus({
    schedule: { courtIds, scheduledDate },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);
  result = tournamentEngine.findMatchUp({ matchUpId });
  expect(result.matchUp.schedule.allocatedCourts.map(({ courtId }) => courtId)).toEqual(courtIds);

  const matchUpFilters = { scheduledDate };
  const minCourtGridRows = 5;
  result = tournamentEngine.competitionScheduleMatchUps({
    withCourtGridRows: true,
    minCourtGridRows,
    matchUpFilters,
  });
  expect(result.dateMatchUps.length).toEqual(1);
  expect(result.dateMatchUps[0].schedule.allocatedCourts.map(({ courtId }) => courtId)).toEqual(courtIds);

  expect(result.rows.length).toEqual(minCourtGridRows);
  expect(Object.values(result.rows[0]).length).toEqual(
    result.courtsData.length + 1, // addition of rowId
  );

  result.courtsData.forEach((court) =>
    expect(court.matchUps.map(({ matchUpId }) => matchUpId).includes(matchUpId)).toEqual(true),
  );

  result = tournamentEngine.removeMatchUpCourtAssignment({
    courtId: courtIds[0],
    tournamentId,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.competitionScheduleMatchUps({ matchUpFilters });
  expect(result.dateMatchUps.length).toEqual(1);
  const updatedCourtIds = result.dateMatchUps[0].schedule.allocatedCourts.map(({ courtId }) => courtId);
  expect(updatedCourtIds.includes(courtIds[0])).toEqual(false);

  result.dateMatchUps[0].schedule.allocatedCourts.forEach((court) => {
    const attrs = Object.keys(court);
    expect(attrs).toEqual(['venueId', 'courtId', 'venueName', 'courtName']);
  });

  expect(unique(result.dateMatchUps[0].schedule.allocatedCourts.map(({ venueId }) => venueId)).length).toEqual(1);

  result = tournamentEngine.removeMatchUpCourtAssignment({
    // not passing courtId will remove all allocatedCourts
    tournamentId,
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.competitionScheduleMatchUps({ matchUpFilters });
  expect(result.dateMatchUps[0].schedule.allocatedCourts).toBeUndefined();

  result = tournamentEngine.getTournament();
  expect(result.tournamentRecord.extensions.filter(({ name }) => name === FACTORY).length).toEqual(1);
});
