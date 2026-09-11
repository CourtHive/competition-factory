import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

/**
 * NATIVE-writeMode sibling for team-matchUp court allocation/removal. Under NATIVE the allocation
 * is first-class `schedule.allocatedCourts` with no ALLOCATE_COURTS timeItem mirror.
 * removeMatchUpCourtAssignment previously read + wrote the allocation via timeItems only, so in
 * NATIVE it crashed on `undefined.filter` (courtId path) and never updated the first-class value.
 *
 * See planning/NATIVE_WRITEMODE_COVERAGE.md.
 */

it('allocate + remove team-matchUp courts operates on first-class allocatedCourts', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 8 }],
    venueProfiles: [{ courtsCount: 6 }],
    startDate: '2023-03-15',
    endDate: '2023-03-22',
  });
  tournamentEngine.setState(tournamentRecord);

  const teamMatchUp = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
  }).matchUps[0];
  const { matchUpId, tournamentId, drawId } = teamMatchUp;
  const courtIds = tournamentEngine.getVenuesAndCourts().courts.map(({ courtId }: any) => courtId);

  expect(tournamentEngine.allocateTeamMatchUpCourts({ matchUpId, drawId, courtIds }).success).toEqual(true);

  const allocated = () => {
    const raw = tournamentEngine
      .getTournament()
      .tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find((m: any) => m.matchUpId === matchUpId);
    // first-class storage, no timeItem mirror
    expect((raw.timeItems ?? []).some((t: any) => t.itemType?.startsWith('SCHEDULE'))).toEqual(false);
    return (raw.schedule?.allocatedCourts ?? []).map((c: any) => c.courtId);
  };
  expect(allocated()).toEqual(courtIds);

  // remove one court — must not crash, must update first-class
  expect(
    tournamentEngine.removeMatchUpCourtAssignment({ courtId: courtIds[0], tournamentId, matchUpId, drawId }).success,
  ).toEqual(true);
  const remaining = allocated();
  expect(remaining.includes(courtIds[0])).toEqual(false);
  expect(remaining.length).toEqual(courtIds.length - 1);

  // remove all (no courtId) — clears the first-class allocation
  expect(tournamentEngine.removeMatchUpCourtAssignment({ tournamentId, matchUpId, drawId }).success).toEqual(true);
  const after = tournamentEngine
    .getTournament()
    .tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps.find((m: any) => m.matchUpId === matchUpId);
  expect(after.schedule?.allocatedCourts).toBeUndefined();
});
