import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

const startDate = '2026-10-01';
const venueId = 'venueId';
const drawId = 'drawId';

function generate(params: Record<string, unknown> = {}) {
  return mocksEngine.generateTournamentRecord({
    venueProfiles: [{ venueName: 'Club Courts', startTime: '08:00', endTime: '20:00', courtsCount: 6, venueId }],
    drawProfiles: [{ drawId, drawSize: 4 }],
    schedulingProfile: [
      { scheduleDate: startDate, venues: [{ venueId, rounds: [{ drawId, winnerFinishingPositionRange: '1-2' }] }] },
    ],
    completeAllMatchUps: true,
    autoSchedule: true,
    startDate,
    ...params,
  }).tournamentRecord;
}

const matchUpsOf = (tournamentRecord: any) => tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps;

// CA 2026-10-23: the schedulers never place a completed matchUp, and there is no override. An auto-scheduled mock
// tournament is played as a real one is: scheduled first, its results applied after, so its completed matchUps carry
// the schedules they were played to (TMX's display-settings preview reads one)
describe('mocksEngine schedules, then plays', () => {
  it('the profiled round is completed and carries the time it was played to', () => {
    // the profile ('1-2', as TMX's preview profiles it) resolves to the semifinal round; the final is not profiled
    const matchUps = matchUpsOf(generate());
    expect(matchUps.every((matchUp: any) => matchUp.matchUpStatus === COMPLETED)).toEqual(true);
    const semifinals = matchUps.filter((matchUp: any) => matchUp.roundNumber === 1);
    expect(semifinals.length).toEqual(2);
    for (const matchUp of semifinals) {
      expect(matchUp.schedule?.scheduledTime).toEqual('08:00');
      expect(matchUp.schedule?.scheduledDate).toEqual(startDate);
    }
  });

  it('the retired option changes nothing: it is accepted and ignored', () => {
    const withFlag = matchUpsOf(generate({ scheduleCompletedMatchUps: true }));
    expect(withFlag.filter((matchUp: any) => matchUp.schedule?.scheduledTime).length).toEqual(2);
  });

  it('without auto-scheduling, results are applied as the draw is generated, and nothing is timed', () => {
    const matchUps = matchUpsOf(generate({ autoSchedule: false }));
    expect(matchUps.every((matchUp: any) => matchUp.matchUpStatus === COMPLETED)).toEqual(true);
    expect(matchUps.some((matchUp: any) => matchUp.schedule?.scheduledTime)).toEqual(false);
  });
});
