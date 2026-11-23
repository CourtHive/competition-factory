import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

const DAY = '2026-10-01';

// CA 2026-10-23: completed matchUps are excluded from re-scheduling. The flag that once let the profile schedulers
// place them is ignored; mocksEngine's seeding, which is not an operator scheduling, keeps its own way in
it('scheduleProfileRounds never places a completed matchUp, whatever scheduleCompletedMatchUps says', () => {
  const outcomes = [1, 2, 3, 4].map((roundPosition) => ({
    roundNumber: 1,
    roundPosition,
    scoreString: '6-1 6-1',
    winningSide: 1,
  }));
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: 'venue-1', courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 8, outcomes }],
    startDate: DAY,
    endDate: DAY,
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const { tournamentId } = tournamentRecord;
  const { eventId, drawDefinitions } = tournamentRecord.events[0];
  const { drawId, structures } = drawDefinitions[0];
  for (const roundNumber of [1, 2]) {
    const result = tournamentEngine.addSchedulingProfileRound({
      round: { tournamentId, eventId, drawId, structureId: structures[0].structureId, roundNumber },
      scheduleDate: DAY,
      venueId: 'venue-1',
    });
    expect(result.success).toEqual(true);
  }

  const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAY], scheduleCompletedMatchUps: true });
  expect(result.success).toEqual(true);
  const roundOne = tournamentEngine.allTournamentMatchUps({ matchUpFilters: { roundNumbers: [1] } }).matchUps;
  expect(roundOne.filter((matchUp: any) => matchUp.schedule?.scheduledTime)).toEqual([]);
  expect(result.scheduledMatchUpIds[DAY].length).toEqual(2);
});
