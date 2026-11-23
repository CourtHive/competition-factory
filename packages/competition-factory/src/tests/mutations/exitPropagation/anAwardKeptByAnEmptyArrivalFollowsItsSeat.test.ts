import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replayFailure as replay } from '@Tests/testHarness/exitPropagation/sweep';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

/**
 * AN AWARD KEPT BY AN EMPTY ARRIVAL FOLLOWS ITS SEAT (census run 18 F2 ERROR_IMPLIES_NO_MUTATION, FEED_IN_CHAMPIONSHIP
 * 8/7 under `doubleExitPropagateBye: false`, seed 20698096).
 *
 * `Main|1|2`'s walkover carries its loser past two Consolation BYEs into `Consolation|3|1`, awarded at once to the seat
 * nobody has reached. `Main|1|3`'s default then converges `Consolation|1|2` with `Main|1|4`'s double default, and the
 * produced exit it sends to `Consolation|2|2` advances that matchUp's empty seat, dp 3, into `3|1` — the seat the award
 * names. With two positions present `3|1` sorts by drawPosition, so dp 3 takes side 1 and the carrier moves to side 2.
 * The sides' records moved with them; the kept award did not, and went on naming side 2: the carrier who walked over.
 * Relabelling `Main|1|3`'s default as played then withdrew the produced exit, but its reservation was not released (an
 * award to the seat it holds is what releases it), and the real winner of `Consolation|2|2` was refused the seat —
 * `ERR_EXISTING_POSITION_ASSIGNMENT`, after the result had been written.
 */

const POLICY_OFF = { [POLICY_TYPE_PROGRESSION]: { doubleExitPropagateBye: false } };
const CONFIG = {
  drawType: FEED_IN_CHAMPIONSHIP,
  propagateExitStatus: true,
  participantsCount: 7,
  drawSize: 8,
  seed: 20698096,
};
const at = (key: string, outcome: any) => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  at('Main|1|2', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|1|4', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|3', { winningSide: 1 }),
  at('Main|2|1', { winningSide: 1 }),
  at('Consolation|2|2', { matchUpStatus: WALKOVER, winningSide: 2 }),
];

it('no mutation is refused after it has written', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'award-follows-seat', POLICY_OFF)).toBeNull();
});

it('the award names the seat dp 3 holds, and the reservation goes with the exit that made it', () => {
  setSubscriptions({});
  const drawId = 'award-follows-seat-steps';
  prepareDraw(CONFIG, drawId, POLICY_OFF);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  const apply = (step: any) =>
    observeMutation({
      propagateExitStatus: true,
      matchUpId: find(coordinate(step)).matchUpId,
      outcome: step.outcome,
      drawId,
    });

  for (const step of SCHEDULE.slice(0, 3)) apply(step);
  const awarded = find('Consolation|3|1');
  expect(awarded.drawPositions).toEqual([3, 5]);
  const carrier = awarded.sides.find((side: any) => side.participantId);
  expect(awarded.winningSide).toEqual(3 - carrier.sideNumber);

  apply(SCHEDULE[3]);
  expect(find('Consolation|3|1').drawPositions).not.toContain(3);

  for (const step of SCHEDULE.slice(4)) expect(apply(step)?.error).toBeUndefined();
  const fed = find('Consolation|3|1');
  expect(fed.drawPositions).toEqual([5, 6]);
});
