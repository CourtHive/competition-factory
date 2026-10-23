import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants and types
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

// C6 (SCHEDULING_PIPELINE_VNEXT.md § 5, found by the scheduling scale source): the grid read the container -> groups map
// as group -> container, so a round profiled on a round robin's container found no matchUp and the grid placed none.

it('scheduleProfileGrid places the matchUps of rounds profiled on a round robin', () => {
  const venueId = 'venue-1';
  const day = '2026-10-01';
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId, courtsCount: 6, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 8, drawType: ROUND_ROBIN }],
    startDate: day,
    endDate: day,
    setState: true,
  });
  const { tournamentId, events } = tournamentEngine.getTournament().tournamentRecord;
  const { eventId, drawDefinitions } = events[0];
  const { drawId, structures } = drawDefinitions[0];
  const container = structures[0];
  expect(container.structures?.length).toEqual(2);

  const rounds = [1, 2, 3].map((roundNumber) => ({
    structureId: container.structureId,
    tournamentId,
    roundNumber,
    eventId,
    drawId,
  }));
  let result: any = tournamentEngine.setSchedulingProfile({
    schedulingProfile: [{ scheduleDate: day, venues: [{ venueId, rounds }] }],
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.scheduleProfileGrid({ scheduleDates: [day] });
  expect(result.success).toEqual(true);
  const matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  expect(matchUps.length).toEqual(12);
  // was: nothing placed, nothing reported
  expect(result.scheduledMatchUpIds[day]?.length).toEqual(12);
  expect(matchUps.every((m: any) => m.schedule?.scheduledDate === day && m.schedule?.courtOrder)).toEqual(true);
});
