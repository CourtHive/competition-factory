import { replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_DEFAULT, DOUBLE_WALKOVER, BYE } from '@Constants/matchUpStatusConstants';
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A BYE CLAIMED FOR THE LOSER OF WHAT AN EXIT DECIDED GOES WHEN THAT EXIT GOES (census run-17 baseline F3
 * MONOTONIC_DECISION, COMPASS 16, `doubleExitPropagateBye: false`).
 *
 * A double exit's produced exit can decide a matchUp a round on, and the BYE claimed for that matchUp's loser stands on
 * the double exit's account. When the double exit is re-derived to a single exit, the exit it produced is withdrawn,
 * the matchUp a round on becomes a contest between two participants, and its loser is owed the seat. The BYE stood,
 * and a later result in that contest took it back (MONOTONIC_DECISION):
 *
 *  - 20731395: `West|1|3`'s double walkover, re-derived to the default left by `East|1|6`'s correction, kept every
 *    claim it held over its loser link, including the one in `Southwest|1|1` for `West|2|2`'s loser. Only the claim at
 *    its own loser target is still owed.
 *  - 20745815: the matchUp an exit was withdrawn from is left undecided, no exit of its own, and its own claim stood.
 *
 * Replayed through the census's own `replay`: every per-step property, then the forward monotonic check.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const config = (seed: number, participantsCount: number) => ({
  drawType: COMPASS,
  propagateExitStatus: true,
  participantsCount,
  drawSize: 16,
  seed,
});
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it('20731395: the double exit re-derived over its loser link keeps only the claim at its own loser target', () => {
  setSubscriptions({});
  const drawId = 'claimed-further-on-20731395';
  const steps = [
    at('East|1|5', { matchUpStatus: DOUBLE_DEFAULT }),
    at('East|1|7', { winningSide: 2 }),
    at('East|1|2', { winningSide: 2 }),
    at('East|2|1', { matchUpStatus: 'WALKOVER', winningSide: 1 }),
    at('East|1|3', { winningSide: 2 }),
    at('East|1|6', { matchUpStatus: 'WALKOVER', winningSide: 2 }),
    at('East|1|6', { winningSide: 2 }),
  ];
  expect(replay(config(20731395, 14), steps, drawId, POLICY_OFF)).toBeNull();
  const seat = getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === 'Southwest|1|1');
  expect(seat.matchUpStatus).not.toEqual(BYE);
  expect(seat.sides.some((side: any) => side.bye)).toEqual(false);
});

it('20745815: a matchUp left undecided by a withdrawn exit gives up the BYE it claimed', () => {
  setSubscriptions({});
  const steps = [
    at('East|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
    at('East|1|5', { matchUpStatus: 'DEFAULTED', winningSide: 1 }),
    at('East|1|6', { winningSide: 2 }),
    at('East|2|3', { matchUpStatus: 'DEFAULTED', winningSide: 1 }),
    at('East|1|7', { winningSide: 1 }),
    at('East|1|2', { matchUpStatus: 'WALKOVER', winningSide: 1 }),
    at('East|1|4', { winningSide: 2 }),
    at('East|2|1', { winningSide: 2 }),
    at('East|2|4', { winningSide: 2 }),
    at('East|2|3', { winningSide: 1 }),
    at('East|2|2', { winningSide: 2 }),
    at('East|3|2', { matchUpStatus: 'WALKOVER', winningSide: 1 }),
    at('North|1|1', { winningSide: 2 }),
  ];
  expect(replay(config(20745815, 13), steps, 'claimed-further-on-20745815', POLICY_OFF)).toBeNull();
});
