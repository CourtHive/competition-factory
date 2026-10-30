import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { describe, expect, it } from 'vitest';

// constants
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';

// getMatchUpScheduleBounds (CA 2026-10-30): where a matchUp may be scheduled, and when its recorded times may fall,
// read from the same neighbours the schedule writes judge. A client limits its pickers to the bounds, so the bounds and
// the refusals must agree on every placement.

const day1 = '2026-10-01';
const day2 = '2026-10-02';
const day3 = '2026-10-03';

const at = (roundNumber: number, roundPosition: number) =>
  tournamentEngine
    .allTournamentMatchUps()
    .matchUps.find((m: any) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);

const write = (matchUp: any, schedule: any, extra: any = {}) =>
  tournamentEngine.addMatchUpScheduleItems({
    matchUpId: matchUp.matchUpId,
    drawId: matchUp.drawId,
    schedule,
    ...extra,
  });

const boundsOf = (matchUp: any, extra: any = {}) =>
  tournamentEngine.getMatchUpScheduleBounds({ matchUpId: matchUp.matchUpId, drawId: matchUp.drawId, ...extra });

/** an 8 draw over three days: semifinal 1 placed day 2 at 10:00, the final day 3 at 12:00 */
function placedDraw() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8 }],
    startDate: day1,
    endDate: day3,
    setState: true,
  });
  expect(write(at(2, 1), { scheduledDate: day2, scheduledTime: '10:00' }).success).toEqual(true);
  expect(write(at(3, 1), { scheduledDate: day3, scheduledTime: '12:00' }).success).toEqual(true);
  return { quarterfinal: at(1, 1), semifinal: at(2, 1), final: at(3, 1) };
}

/** the bounds as the documentation states them: dates inclusive, a boundary date's time strictly inside */
function inBounds(bounds: any, date: string, time?: string) {
  if (bounds.earliestDate && date < bounds.earliestDate) return false;
  if (bounds.latestDate && date > bounds.latestDate) return false;
  const after = bounds.scheduledAfter;
  if (after && time && date === after.date && time <= after.time) return false;
  const before = bounds.scheduledBefore;
  return !(before && time && date === before.date && time >= before.time);
}

describe('getMatchUpScheduleBounds', () => {
  it('bounds a matchUp by its dated sources and dependents, and by the tournament', () => {
    const { quarterfinal, semifinal, final } = placedDraw();

    let result: any = boundsOf(quarterfinal);
    expect(result.success).toEqual(true);
    expect(result.bounds).toMatchObject({
      earliestDate: day1,
      latestDate: day2,
      scheduledBefore: { date: day2, time: '10:00', inclusive: false },
    });
    expect(result.bounds.scheduledAfter).toBeUndefined();
    expect(result.bounds.orderedBy.map((m: any) => m.relation)).toEqual(['dependent', 'dependent']);

    result = boundsOf(semifinal);
    expect(result.bounds).toMatchObject({
      earliestDate: day1,
      latestDate: day3,
      scheduledBefore: { date: day3, time: '12:00', inclusive: false },
    });

    result = boundsOf(final);
    expect(result.bounds).toMatchObject({
      earliestDate: day2,
      latestDate: day3,
      scheduledAfter: { date: day2, time: '10:00', inclusive: false },
    });
  });

  it('agrees with the schedule writes on every placement', () => {
    const { quarterfinal, semifinal, final } = placedDraw();
    const times = [undefined, '09:00', '10:00', '11:00', '12:00', '13:00'];
    for (const matchUp of [quarterfinal, semifinal, final]) {
      const { bounds } = boundsOf(matchUp);
      for (const date of [day1, day2, day3]) {
        for (const time of times) {
          const schedule = { scheduledDate: date, ...(time ? { scheduledTime: time } : {}) };
          const accepted = !!write(matchUp, schedule, { validateOnly: true }).success;
          expect({ matchUpId: matchUp.matchUpId, date, time, accepted }).toEqual({
            matchUpId: matchUp.matchUpId,
            accepted: inBounds(bounds, date, time),
            date,
            time,
          });
        }
      }
    }
  });

  it('plannedOrder: false bounds by played matchUps only, as the writes do', () => {
    const { quarterfinal } = placedDraw();
    const { bounds } = boundsOf(quarterfinal, { plannedOrder: false });
    expect(bounds).toMatchObject({ earliestDate: day1, latestDate: day3 });
    expect(bounds.orderedBy).toEqual([]);
  });

  it('bounds recorded times by the linked matchUps’ recorded times', () => {
    const { quarterfinal, semifinal, final } = placedDraw();
    expect(write(semifinal, { startTime: '10:00', endTime: '11:30' }).success).toEqual(true);

    expect(boundsOf(final).bounds.recordedAfter).toEqual({ date: day2, time: '11:30', inclusive: true });
    expect(boundsOf(quarterfinal).bounds.recordedBefore).toEqual({ date: day2, time: '10:00', inclusive: true });
  });

  it('an end past midnight bounds on the day it fell', () => {
    const { semifinal, final } = placedDraw();
    expect(write(semifinal, { startTime: '23:00', endTime: '00:30' }).success).toEqual(true);
    expect(boundsOf(final).bounds.recordedAfter).toEqual({ date: day3, time: '00:30', inclusive: true });
  });

  it('reports a matchUp it cannot find', () => {
    const { final } = placedDraw();
    const result: any = tournamentEngine.getMatchUpScheduleBounds({ drawId: final.drawId, matchUpId: 'bogus' });
    expect(result.error).toEqual(MATCHUP_NOT_FOUND);
  });
});
