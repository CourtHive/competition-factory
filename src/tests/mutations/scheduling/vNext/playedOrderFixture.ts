import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect } from 'vitest';

export const DAYS = ['2026-10-01', '2026-10-02'];

/**
 * Two draws of 8 on one venue. Draw A's round 1 is played on day 2, with scores, and its round 2 is profiled on day 1,
 * before its sources were played; draw B's round 1 is profiled on day 1 too, and nothing stands in its way.
 */
export function playedLaterFixture() {
  mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueId: 'venue-1', courtsCount: 4, startTime: '08:00', endTime: '20:00' }],
    drawProfiles: [{ drawSize: 8 }, { drawSize: 8 }],
    startDate: DAYS[0],
    endDate: DAYS[1],
    setState: true,
  });
  const { tournamentRecord } = tournamentEngine.getTournament();
  const { tournamentId } = tournamentRecord;
  const [drawA, drawB] = tournamentRecord.events.map((event: any) => ({
    eventId: event.eventId,
    drawId: event.drawDefinitions[0].drawId,
    structureId: event.drawDefinitions[0].structures[0].structureId,
  }));
  const roundOf = (drawId: string, roundNumber: number) =>
    tournamentEngine.allTournamentMatchUps({ matchUpFilters: { drawIds: [drawId], roundNumbers: [roundNumber] } })
      .matchUps;

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
  for (const { matchUpId } of roundOf(drawA.drawId, 1)) {
    let result: any = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: DAYS[1], scheduledTime: '09:00' },
      drawId: drawA.drawId,
      matchUpId,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setMatchUpStatus({ drawId: drawA.drawId, matchUpId, outcome });
    expect(result.success).toEqual(true);
  }
  for (const [draw, roundNumber] of [
    [drawA, 2],
    [drawB, 1],
  ] as const) {
    const result = tournamentEngine.addSchedulingProfileRound({
      round: { tournamentId, ...draw, roundNumber },
      scheduleDate: DAYS[0],
      venueId: 'venue-1',
    });
    expect(result.success).toEqual(true);
  }
  return { tournamentId, drawA, drawB, roundOf };
}

/** the matchUps given a time on day 1, by matchUpId */
export function timedOnDayOne(matchUps: any[]) {
  return matchUps.filter((matchUp) => matchUp.schedule?.scheduledDate === DAYS[0] && matchUp.schedule?.scheduledTime);
}
