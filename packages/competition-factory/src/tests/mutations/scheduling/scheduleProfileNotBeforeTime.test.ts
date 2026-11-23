import competitionEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants and fixtures
import POLICY_SCHEDULING_NO_DAILY_LIMITS from '@Fixtures/policies/POLICY_SCHEDULING_NO_DAILY_LIMITS';

/**
 * A profile round's `notBeforeTime` (rain-day recovery G5, CA 2026-11-23): no matchUp of the round is placed before it.
 * The field was typed, stored and validated, but the timed scheduler never read it, so a round told "not before 11:30"
 * took the venue's opening slots. Rain-day recovery relies on it to hold the next day's matchUps to their imported
 * starts, while the rounds carried over from the interrupted day carry none and so start as early as their own
 * constraints allow.
 */
const venueId = 'venue1';
const day = '2022-01-02';
const dayBefore = '2022-01-01';

function setup() {
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    policyDefinitions: POLICY_SCHEDULING_NO_DAILY_LIMITS,
    venueProfiles: [{ startTime: '08:00', endTime: '20:00', courtsCount: 8, venueId }],
    eventProfiles: [{ drawProfiles: [{ drawSize: 16, idPrefix: 'p' }] }],
    startDate: dayBefore,
    endDate: '2022-01-03',
  });
  competitionEngine.setState(tournamentRecord);
  const { matchUps } = competitionEngine.allCompetitionMatchUps({ inContext: true });
  const { tournamentId, eventId, drawId, structureId } = matchUps[0];
  const roundOf = (roundNumber: number): string[] =>
    matchUps.filter((matchUp: any) => matchUp.roundNumber === roundNumber).map(({ matchUpId }) => matchUpId);
  const round = (roundNumber: number, extra: Record<string, unknown> = {}) => ({
    tournamentId,
    eventId,
    drawId,
    structureId,
    roundNumber,
    ...extra,
  });
  const profile = (rounds: any[]) => {
    const result: any = competitionEngine.setSchedulingProfile({
      schedulingProfile: [{ scheduleDate: day, venues: [{ venueId, rounds }] }],
    });
    expect(result.success).toEqual(true);
  };
  return { drawId, roundOf, round, profile };
}

/** the times a run placed, by matchUpId */
function placedTimes(result: any): Record<string, string> {
  const times: Record<string, string> = {};
  for (const placements of Object.values(result.placements?.[day] ?? {}) as any[])
    for (const { matchUpId, scheduleTime } of placements) times[matchUpId] = scheduleTime;
  return times;
}

const minutes = (time: string) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3, 5));

describe("a profile round's notBeforeTime", () => {
  it('places none of the round before it; the control without it does', () => {
    const { roundOf, round, profile } = setup();
    const r1 = roundOf(1);

    profile([round(1)]);
    let result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [day], dryRun: true });
    expect(result.success).toEqual(true);
    const control = placedTimes(result);
    expect(Object.keys(control).sort()).toEqual([...r1].sort());
    expect(r1.some((matchUpId) => minutes(control[matchUpId]) < minutes('11:30'))).toEqual(true);

    profile([round(1, { notBeforeTime: '11:30' })]);
    result = competitionEngine.scheduleProfileRounds({ scheduleDates: [day], dryRun: true });
    expect(result.success).toEqual(true);
    const held = placedTimes(result);
    expect(Object.keys(held).sort()).toEqual([...r1].sort());
    for (const matchUpId of r1) expect(minutes(held[matchUpId])).toBeGreaterThanOrEqual(minutes('11:30'));
    // the round fits the day, so nothing is left without a time and nothing is reported as held back
    expect(result.noTimeMatchUpIds[day]).toEqual([]);
    expect(result.notBeforeDeferredMatchUpIds[day]).toEqual({});
  });

  it('holds each entry of a round split by matchUpIds to its own time', () => {
    const { roundOf, round, profile } = setup();
    const r1 = roundOf(1);
    const [early, late] = [r1.slice(0, 4), r1.slice(4)];

    profile([
      round(1, { matchUpIds: early, notBeforeTime: '09:00' }),
      round(1, { matchUpIds: late, notBeforeTime: '13:00' }),
    ]);
    const result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [day], dryRun: true });
    expect(result.success).toEqual(true);
    const times = placedTimes(result);
    expect(Object.keys(times).sort()).toEqual([...r1].sort());
    for (const matchUpId of early) expect(minutes(times[matchUpId])).toBeGreaterThanOrEqual(minutes('09:00'));
    for (const matchUpId of late) expect(minutes(times[matchUpId])).toBeGreaterThanOrEqual(minutes('13:00'));
    // the early entry is not held to the late one's time
    expect(early.some((matchUpId) => minutes(times[matchUpId]) < minutes('13:00'))).toEqual(true);
  });

  it('leaves a round without one to start at the opening, though its matchUps were timed late the day before', () => {
    const { drawId, roundOf, round, profile } = setup();
    const r1 = roundOf(1);
    // the interrupted day: round 1 was set for 16:30 and never played
    for (const matchUpId of r1) {
      const result: any = competitionEngine.addMatchUpScheduleItems({
        schedule: { scheduledDate: dayBefore, scheduledTime: '16:30', venueId },
        matchUpId,
        drawId,
      });
      expect(result.success).toEqual(true);
    }

    // carried over to the next day with no notBeforeTime; round 2 is the next day's own, held to its imported 14:00
    profile([round(1), round(2, { notBeforeTime: '14:00' })]);
    const result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [day], dryRun: true });
    expect(result.success).toEqual(true);
    const times = placedTimes(result);
    for (const matchUpId of r1) expect(times[matchUpId]).toEqual('08:00');
    for (const matchUpId of roundOf(2)) expect(minutes(times[matchUpId])).toBeGreaterThanOrEqual(minutes('14:00'));
  });

  it('reports a round it leaves no slot for as without a time, and why', () => {
    const { roundOf, round, profile } = setup();
    const r1 = roundOf(1);

    // the venue's last slot leaves the matchUp no time to finish before 20:00
    profile([round(1, { notBeforeTime: '19:30' })]);
    let result: any = competitionEngine.scheduleProfileRounds({ scheduleDates: [day], dryRun: true });
    expect(result.success).toEqual(true);
    expect(placedTimes(result)).toEqual({});
    expect([...result.noTimeMatchUpIds[day]].sort()).toEqual([...r1].sort());
    const deferred = result.notBeforeDeferredMatchUpIds[day];
    expect(Object.keys(deferred).sort()).toEqual([...r1].sort());
    for (const matchUpId of r1) {
      expect(deferred[matchUpId].notBeforeTime).toEqual('19:30');
      expect(minutes(deferred[matchUpId].scheduleTime)).toBeLessThan(minutes('19:30'));
    }

    // a wet run writes no time for them either
    result = competitionEngine.scheduleProfileRounds({ scheduleDates: [day] });
    expect(result.success).toEqual(true);
    const { matchUps } = competitionEngine.allCompetitionMatchUps({ matchUpFilters: { matchUpIds: r1 } });
    for (const matchUp of matchUps) expect(matchUp.schedule?.scheduledTime).toBeUndefined();
  });
});
