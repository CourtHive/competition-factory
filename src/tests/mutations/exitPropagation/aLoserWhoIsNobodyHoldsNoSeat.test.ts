import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A LOSER WHO IS NOBODY HOLDS NO SEAT (census run 17 F3 MONOTONIC_DECISION, COMPASS 32/30 seed 20733408,
 * `doubleExitPropagateBye: false`).
 *
 * `East|1|3`'s double walkover produces a walkover into `West|1|2`, awarded to its empty seat: the matchUp's losing side
 * holds no participant, and the BYE owed to its loser joins the BYE already in `South|1|1`. Two BYEs meeting make one,
 * and it goes on through `South|2|1` to `South|3|1`. `East|1|4`'s walkover then sends its loser into `West|1|2`, which
 * converges, and the loser it had directed is taken back. That loser was nobody, and the undefined id matched every
 * seat of `South` holding no participant: the BYE's advancement into `South|3|1` was released while both BYEs behind it
 * still stood.
 *
 * Replayed through the census's own `replay`: every per-step property, then the forward monotonic check (whose probes,
 * `East|1|3` then `East|1|4`, are the last two steps of the direct read below).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const config = { drawType: COMPASS, propagateExitStatus: true, participantsCount: 30, drawSize: 32, seed: 20733408 };
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const setup = [
  at('East|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('East|1|8', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('East|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
];

it('the convergence un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(config, setup, 'loser-nobody', POLICY_OFF)).toBeNull();
});

it('the BYE two BYEs sent on stays where it went', () => {
  setSubscriptions({});
  const drawId = 'loser-nobody-direct';
  prepareDraw(config, drawId, POLICY_OFF);
  const steps = [
    ...setup,
    at('East|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
    at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
  ];
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  for (const step of steps) {
    const params = {
      propagateExitStatus: true,
      matchUpId: find(coordinate(step)).matchUpId,
      outcome: step.outcome,
      drawId,
    };
    expect(observeMutation(params).error).toBeUndefined();
  }
  expect(find('West|1|2').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  // the BYEs behind the convergence stand, and the one `South|2|1` advanced keeps its seat there
  for (const key of ['South|1|1', 'South|2|1']) expect(find(key).matchUpStatus, key).toEqual(BYE);
  expect(find('South|2|1').drawPositions.filter(Boolean)).toEqual([2]);
  // `South|1|2`'s produced walkover, held beside that BYE, goes on and waits in `South|3|1`, pending; the holder's BYE
  // is no opponent there (census S6: a held exit is sent on while the other feeder can still deliver, CA 2026-09-24).
  // Before, the exit stayed held and `South|3|1` read BYE in this order alone: 10 of the schedule's 120 orders
  const final = find('South|3|1');
  expect(final.matchUpStatus).toEqual(WALKOVER);
  expect(final.winningSide).toBeUndefined();
  expect((final.drawPositions ?? []).filter(Boolean)).toEqual([]);
});
