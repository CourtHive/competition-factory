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
 * Under the policy off the convergence no longer leaves a BYE there (CA ruling (A), 2026-10-21): `West|1|2`'s loser seat
 * shows the walkover it produced, which `South|1|1`'s draw BYE relays into `South|2|1`, where it meets `South|1|2`'s
 * produced walkover. The guard stands: the loser taken back is still nobody, and nothing the draw placed in `South` is
 * released for it.
 *
 * Replayed through the census's own `replay`: every per-step property, then the forward monotonic check (whose probes,
 * `East|1|3` then `East|1|4`, are the last two steps of the direct read below), and the whole schedule replayed with
 * those two steps, so every step is held to LOSER_SEAT_DERIVED.
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

it('the schedule with its two probes replayed un-decides nothing, and every loser seat is derived', () => {
  setSubscriptions({});
  const probes = [
    at('East|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
    at('East|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
  ];
  expect(replay(config, [...setup, ...probes], 'loser-nobody-probed', POLICY_OFF)).toBeNull();
});

it("the convergence's produced walkover travels on past the BYE beside it and converges again", () => {
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
  // under the policy off the convergence's loser seat, `South|1|1` dp 2, shows the walkover it produced, not the BYE its
  // single exit had sent there (CA ruling (A), 2026-10-21); the draw's own BYE beside it relays that walkover on, and in
  // `South|2|1` it meets the walkover `South|1|2`'s double walkover produced, so that matchUp converges too
  expect(find('South|1|1').matchUpStatus).toEqual(BYE);
  expect(find('South|1|1').sideExitProvenance?.[2]).toMatchObject({ matchUpStatus: WALKOVER });
  expect(find('South|2|1').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(find('South|2|1').drawPositions.filter(Boolean)).toEqual([2]);
  // ...and `West|2|1`, where the walkover `West|1|2` produced meets the one relayed past `West|1|1`'s BYE, converges, so
  // its loser seat shows the produced walkover as well
  expect(find('West|2|1').matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(find('Southwest|1|1').sideExitProvenance?.[1]).toMatchObject({ matchUpStatus: WALKOVER });
  // `South|2|1`'s produced walkover goes on and waits in `South|3|1`, pending (census S6: a held exit is sent on while
  // the other feeder can still deliver, CA 2026-09-24)
  const final = find('South|3|1');
  expect(final.matchUpStatus).toEqual(WALKOVER);
  expect(final.winningSide).toBeUndefined();
  expect((final.drawPositions ?? []).filter(Boolean)).toEqual([]);
});
