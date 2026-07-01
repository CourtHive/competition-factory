import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import queryEngine from '@Engines/queryEngine';
import { expect, it } from 'vitest';

// constants
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';

// Coverage/regression: getMatchUpScheduleDetails cached venue data on the correct
// venueId but tested cache presence with the misspelled allocatedCourt.venueid
// (venueDataMap[undefined], always falsy), so getVenueData was re-fetched for every
// allocated court instead of once per venue. Output is unchanged (line 290 always wrote
// the correct key); this test locks correct per-venue venueName resolution across courts
// drawn from two venues, exercising the corrected cache-presence check.
it('resolves allocatedCourt venueName across multiple venues', () => {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 8 }],
    venueProfiles: [
      { venueName: 'Venue Alpha', courtsCount: 2 },
      { venueName: 'Venue Beta', courtsCount: 2 },
    ],
    startDate: '2023-03-15',
    endDate: '2023-03-22',
  });
  tournamentEngine.setState(tournamentRecord);

  const teamMatchUp = queryEngine.allTournamentMatchUps({ matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] } })
    .matchUps[0];
  const { matchUpId, drawId } = teamMatchUp;

  const { venues, courts } = queryEngine.getVenuesAndCourts();
  expect(venues.length).toEqual(2);
  const venueNameById = new Map(venues.map((v) => [v.venueId, v.venueName]));
  const courtIds = courts.map((c) => c.courtId);

  const result: any = tournamentEngine.allocateTeamMatchUpCourts({ matchUpId, courtIds, drawId });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ matchUpId, inContext: true });
  const allocatedCourts = matchUp.schedule.allocatedCourts;
  expect(allocatedCourts.length).toEqual(courtIds.length);
  for (const allocatedCourt of allocatedCourts) {
    expect(allocatedCourt.venueName).toEqual(venueNameById.get(allocatedCourt.venueId));
  }
  // courts span both venues → both venueNames resolved
  expect(new Set(allocatedCourts.map((ac) => ac.venueName)).size).toEqual(2);
});
