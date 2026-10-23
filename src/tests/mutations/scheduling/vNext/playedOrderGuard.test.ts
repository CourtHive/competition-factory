import { DAYS, playedLaterFixture, timedOnDayOne } from './playedOrderFixture';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it, vi } from 'vitest';

// constants
import { ANACHRONISM } from '@Constants/errorConditionConstants';

// the planner without its gate: the plan it makes places matchUps before their played sources, so the writer's guard
// is what stands between that plan and the records
vi.mock('@Mutate/matchUps/schedule/pipeline/playedOrderGate', async (importOriginal) => {
  const original: any = await importOriginal();
  return { ...original, playedOrderGate: () => () => undefined };
});

describe('the guard over a plan the gate did not make', () => {
  it('refuses the whole run, names every offender, and writes nothing: not even the dates it was to clear', () => {
    const { drawA, drawB, roundOf } = playedLaterFixture();
    // a first run (gated nowhere, so it places draw B and draw A's round 2 is refused by the guard): nothing written
    let result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[0]] });
    expect(result.error).toEqual(ANACHRONISM);
    expect(result.context.refusals.length).toEqual(2);
    expect(timedOnDayOne(roundOf(drawB.drawId, 1))).toEqual([]);

    // draw B timed on day 1 by hand; a run that would clear day 1 first is refused, and day 1 is not cleared
    const [matchUp] = roundOf(drawB.drawId, 1);
    result = tournamentEngine.addMatchUpScheduleItems({
      schedule: { scheduledDate: DAYS[0], scheduledTime: '15:00' },
      matchUpId: matchUp.matchUpId,
      drawId: drawB.drawId,
    });
    expect(result.success).toEqual(true);
    const before = tournamentEngine.getTournament().tournamentRecord;
    result = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[0]], clearScheduleDates: [DAYS[0]] });
    expect(result.error).toEqual(ANACHRONISM);
    expect(tournamentEngine.getTournament().tournamentRecord).toEqual(before);
    expect(timedOnDayOne(roundOf(drawB.drawId, 1)).length).toEqual(1);
    expect(timedOnDayOne(roundOf(drawA.drawId, 2))).toEqual([]);
  });
});
