import { planPlayedOrderRefusal } from '@Mutate/matchUps/schedule/pipeline/playedOrderGate';
import { DAYS, playedLaterFixture, timedOnDayOne } from './playedOrderFixture';
import { buildSchedulingView } from '@Mutate/matchUps/schedule/pipeline/view';
import { planSchedule } from '@Mutate/matchUps/schedule/pipeline/plan';
import tournamentEngine from '@Engines/syncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { ANACHRONISM } from '@Constants/errorConditionConstants';

/**
 * The write shape (CA 2026-10-23, SCHEDULING_PIPELINE_VNEXT.md § 7.A): the planner never takes a slot the played order
 * refuses, and reports the matchUp under its own reason; the writer's guard judges the whole plan before any write.
 */
describe('the played order in the profile scheduler', () => {
  it('holds back a matchUp whose played source is later, and places the rest', () => {
    const { drawA, drawB, roundOf } = playedLaterFixture();
    const result: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[0]] });
    expect(result.success).toEqual(true);

    const heldBack = roundOf(drawA.drawId, 2).map(({ matchUpId }: any) => matchUpId);
    const deferred = result.playedOrderDeferredMatchUpIds[DAYS[0]];
    expect(Object.keys(deferred).toSorted()).toEqual(heldBack.toSorted());
    for (const matchUpId of heldBack) {
      const { scheduleTime, blockingMatchUps } = deferred[matchUpId];
      expect(scheduleTime).toEqual('08:00');
      expect(blockingMatchUps.length).toEqual(2);
      for (const blocking of blockingMatchUps) {
        expect(blocking).toMatchObject({
          relation: 'playedSource',
          scheduledDate: DAYS[1],
          matchUpStatus: 'COMPLETED',
        });
      }
    }
    // reported under that reason alone, and draw B is placed: one stray round does not block the run
    expect(result.noTimeMatchUpIds[DAYS[0]]).toEqual([]);
    expect(result.scheduledMatchUpIds[DAYS[0]].length).toEqual(4);
    expect(timedOnDayOne(roundOf(drawA.drawId, 2))).toEqual([]);
    expect(timedOnDayOne(roundOf(drawB.drawId, 1)).length).toEqual(4);
  });

  it('a dry run reports what the run does', () => {
    playedLaterFixture();
    const dry: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[0]], dryRun: true });
    const real: any = tournamentEngine.scheduleProfileRounds({ scheduleDates: [DAYS[0]] });
    for (const key of ['scheduledMatchUpIds', 'noTimeMatchUpIds', 'playedOrderDeferredMatchUpIds'])
      expect({ key, value: dry[key] }).toEqual({ key, value: real[key] });
  });

  it('the guard names every placement of a plan that breaks the played order', () => {
    const { tournamentId, drawA, roundOf } = playedLaterFixture();
    const { tournamentRecord } = tournamentEngine.getTournament();
    const view: any = buildSchedulingView({ tournamentRecords: { [tournamentId]: tournamentRecord } });
    const plan = planSchedule({ view });
    expect(planPlayedOrderRefusal({ plan, view })).toBeUndefined();

    // a plan the gate did not make: both of draw A's round 2 matchUps at 08:00 on day 1
    const forged = roundOf(drawA.drawId, 2).map(({ matchUpId }: any) => ({ matchUpId, scheduleTime: '08:00' }));
    plan.placements[DAYS[0]]['venue-1'].push(...forged);
    const refusal: any = planPlayedOrderRefusal({ plan, view });
    expect(refusal.error).toEqual(ANACHRONISM);
    expect(refusal.context.refusals.map(({ matchUpId }: any) => matchUpId).toSorted()).toEqual(
      forged.map(({ matchUpId }: any) => matchUpId).toSorted(),
    );
  });
});
