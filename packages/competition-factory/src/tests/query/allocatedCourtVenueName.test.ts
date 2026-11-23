import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { mocksEngine } from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { findMatchUp } from '@Acquire/findMatchUp';
import queryEngine from '@Engines/queryEngine';
import { expect, it } from 'vitest';

// constants
import { TEAM_EVENT } from '@Constants/eventConstants';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';

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

// The bare-id lookup used to hydrate the whole tournament first, and that hydration wrote venueName onto the
// STORED allocatedCourts; the draw-level hydration that produced the result had no tournamentRecord and read the
// leaked names. It now hydrates only the hit, with the record, so the names come from the venues themselves.
it.each([false, true])(
  'a fresh record resolves allocatedCourt venueNames by bare id (nextMatchUps %s)',
  (nextMatchUps) => {
    mocksEngine.generateTournamentRecord({
      drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 8 }],
      venueProfiles: [
        { venueName: 'Venue Alpha', courtsCount: 2 },
        { venueName: 'Venue Beta', courtsCount: 2 },
      ],
      startDate: '2023-03-15',
      endDate: '2023-03-22',
      setState: true,
    });
    const { matchUpId, drawId } = queryEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
    }).matchUps[0];
    const courtIds = queryEngine.getVenuesAndCourts().courts.map((c) => c.courtId);
    let result: any = tournamentEngine.allocateTeamMatchUpCourts({ matchUpId, courtIds, drawId });
    expect(result.success).toEqual(true);

    // a fresh copy: nothing has hydrated it, so nothing has written onto it
    const record = tournamentEngine.getTournament().tournamentRecord;
    result = findMatchUp({ tournamentRecord: record, matchUpId, inContext: true, nextMatchUps });
    const venueNames = result.matchUp.schedule.allocatedCourts.map((ac) => ac.venueName);
    expect(venueNames.toSorted((a, b) => a.localeCompare(b))).toEqual([
      'Venue Alpha',
      'Venue Alpha',
      'Venue Beta',
      'Venue Beta',
    ]);
  },
);

// Hydration is a read. resolveVenueAndCourt used to write venueName/courtName onto the allocatedCourts it was
// handed, which were the STORED ones, so any hydration of a matchUp with allocated courts changed the record.
it('hydrating a matchUp with allocated courts writes nothing onto the stored record', () => {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ eventType: TEAM_EVENT, drawSize: 8 }],
    venueProfiles: [
      { venueName: 'Venue Alpha', courtsCount: 2 },
      { venueName: 'Venue Beta', courtsCount: 2 },
    ],
    startDate: '2023-03-15',
    endDate: '2023-03-22',
    setState: true,
  });
  const { matchUpId, drawId } = queryEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
  }).matchUps[0];
  const courtIds = queryEngine.getVenuesAndCourts().courts.map((c) => c.courtId);
  const result: any = tournamentEngine.allocateTeamMatchUpCourts({ matchUpId, courtIds, drawId });
  expect(result.success).toEqual(true);

  const record = tournamentEngine.getTournament().tournamentRecord;
  const before = JSON.stringify(record);
  const { matchUps } = allTournamentMatchUps({ tournamentRecord: record, inContext: true });
  expect(JSON.stringify(record)).toEqual(before);

  // the hydrated result still carries the names, on its own objects
  const hydrated = matchUps?.find((m) => m.matchUpId === matchUpId);
  expect(hydrated?.schedule?.allocatedCourts?.every((ac) => ac.venueName && ac.courtName)).toEqual(true);
});
