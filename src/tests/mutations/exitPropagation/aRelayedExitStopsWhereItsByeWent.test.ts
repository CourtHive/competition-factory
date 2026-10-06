import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A PRODUCED EXIT CARRIED PAST A BYE COMES TO REST WHERE THAT BYE WAS, ONCE THE BYE IS GONE.
 *
 * Census de 9300866 (DE 16/15, propagation off), shrunk to nine steps. `Backdraw|1|3`'s double walkover produces a
 * walkover on `Backdraw|2|3`, whose other side is a BYE (from `Main|1|6`'s double walkover), so the exit is carried
 * on to `Backdraw|3|2` (CA, 2026-09-20). Re-scoring `Main|1|6` as a single walkover takes the BYE back: the exit
 * now rests on `Backdraw|2|3`, pending for `Main|2|3`'s loser. The copy beyond it kept the ORIGIN's id, which is
 * still a double exit, so nothing withdrew it; `Main|2|3`'s loser then won both walkovers, and the participant
 * arriving on `Backdraw|3|2`'s other side was recorded as its winner (WINNING_SIDE_ADVANCEMENT_MISMATCH).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (coordinate: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = coordinate.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};

const config = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: false,
  participantsCount: 15,
  seed: 9300866,
  drawSize: 16,
};
const steps = [
  at('Main|1|4', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|1|6', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|3', { winningSide: 1 }),
  at('Backdraw|1|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|1|2', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|6', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|2|3', { winningSide: 2 }),
  at('Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
];
const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

function play(drawId: string, schedule: Step[]) {
  setSubscriptions({});
  prepareDraw(config, drawId);
  const find = (coordinate: string) => getDrawMatchUps(drawId).find((matchUp) => key(matchUp) === coordinate);
  for (const step of schedule) {
    const result: any = tournamentEngine.setMatchUpStatus({
      matchUpId: find(key(step)).matchUpId,
      propagateExitStatus: false,
      outcome: step.outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }
  return find;
}

it('the census replay holds every property', () => {
  setSubscriptions({});
  expect(replay(config, steps, 'relayed-exit')).toBeNull();
});

it('the exit rests on the matchUp whose BYE went, and the copy beyond it is withdrawn', () => {
  const beforeBye = play('relayed-exit-before', steps.slice(0, 4));
  // CONTROL: the relay happened, so there was a copy to withdraw
  expect(beforeBye('Backdraw|2|3').matchUpStatus).toEqual('BYE');
  expect(beforeBye('Backdraw|3|2').matchUpStatus).toEqual(WALKOVER);
  expect(beforeBye('Backdraw|3|2').sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);

  const find = play('relayed-exit', steps.slice(0, 7));
  expect(find('Backdraw|2|3').matchUpStatus).toEqual(WALKOVER);
  expect(find('Backdraw|2|3').sideExitProvenance?.[2]?.previousMatchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(find('Backdraw|3|2').matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(find('Backdraw|3|2').sideExitProvenance).toBeUndefined();
});

it('matches the same results entered in their final order', () => {
  const [first, , third, fourth, fifth, sixth, seventh, eighth, ninth] = steps;
  // each play replaces the engine's state, so each is read before the next begins
  const read = (find: (coordinate: string) => any) =>
    ['Backdraw|2|3', 'Backdraw|3|2', 'Backdraw|4|2'].map((coordinate) => {
      const { matchUpStatus, winningSide, drawPositions } = find(coordinate);
      return { coordinate, matchUpStatus, winningSide, drawPositions };
    });
  const direct = read(play('relayed-exit-direct', [first, seventh, third, fourth, fifth, sixth, eighth, ninth]));
  const corrected = read(play('relayed-exit', steps));
  expect(corrected).toEqual(direct);
});
