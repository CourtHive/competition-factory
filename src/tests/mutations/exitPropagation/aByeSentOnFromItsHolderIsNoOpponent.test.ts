import { getDrawMatchUps, observeMutation } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A BYE SENT ON FROM ITS HOLDER IS NO OPPONENT (census run 18 MONOTONIC_DECISION, DOUBLE_ELIMINATION 16/14, seed
 * 20625526, failing in all three arms).
 *
 * `Backdraw|2|1`'s double walkover reaches `Backdraw|3|1`, which `Backdraw|2|2` holds: its BYE and the exit
 * `Backdraw|1|2`'s double walkover left there. Before the two exits meet, the arrival reads `3|1` as a BYE and sends an
 * exit on into `Backdraw|4|1`; the BYE that matchUp holds goes on alone into `Backdraw|5|1`. The settle then converges
 * `3|1` and produces its exit into `4|1` — whose own BYE was now the lone position in `5|1`. That position was read as
 * the opponent the exit is awarded to, so it was moved on again: a BYE in the Backdraw final, and the Main final's loser
 * carried across its winner link into the decider, while `Backdraw|3|2`, whose winner is owed `5|1`'s other side, was
 * still to be played. Scoring `Backdraw|3|2` then took the decider seat and the Backdraw final's BYE back.
 *
 * The rule: a position that came out of the target is not an opponent waiting in the next matchUp. The BYE stays and
 * the exit travels, pending, as onto an empty matchUp; the holder's BYE is taken back out of `5|1` first. Entering
 * `Backdraw|3|2` before `Backdraw|2|1` reaches the same draw.
 */

const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: false,
  participantsCount: 14,
  drawSize: 16,
  seed: 20625526,
};
const at = (key: string, outcome: any) => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const SCHEDULE = [
  at('Main|1|3', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Main|1|4', { winningSide: 2 }),
  at('Main|1|5', { winningSide: 2 }),
  at('Main|1|7', { matchUpStatus: DEFAULTED, winningSide: 1 }),
  at('Backdraw|1|3', { matchUpStatus: WALKOVER, winningSide: 1 }),
  at('Main|2|4', { winningSide: 2 }),
  at('Main|1|2', { winningSide: 2 }),
  at('Main|1|6', { winningSide: 2 }),
  at('Backdraw|2|4', { winningSide: 1 }),
  at('Main|2|1', { matchUpStatus: RETIRED, winningSide: 1, score: { sets: [{ side1Score: 6, side2Score: 3 }] } }),
  at('Main|2|3', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Backdraw|1|2', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Main|2|2', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|4|1', { winningSide: 1 }),
];
const CONVERGING = at('Backdraw|2|1', { matchUpStatus: DOUBLE_WALKOVER });
const PLAYED = at('Backdraw|3|2', {
  matchUpStatus: RETIRED,
  winningSide: 1,
  score: { sets: [{ side1Score: 6, side2Score: 3 }] },
});

function play(drawId: string, steps: any[]) {
  setSubscriptions({});
  prepareDraw(CONFIG, drawId);
  const find = (key: string) => getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);
  for (const step of steps) {
    const result: any = observeMutation({
      propagateExitStatus: CONFIG.propagateExitStatus,
      matchUpId: find(coordinate(step)).matchUpId,
      outcome: step.outcome,
      drawId,
    });
    expect(result.error).toBeUndefined();
  }
  return find;
}

const state = (find: (key: string) => any, key: string) => {
  const matchUp = find(key);
  return {
    matchUpStatus: matchUp.matchUpStatus,
    winningSide: matchUp.winningSide,
    drawPositions: (matchUp.drawPositions ?? []).filter(Boolean),
    participants: (matchUp.sides ?? []).map((side: any) => side?.participantId ?? (side?.bye ? 'BYE' : undefined)),
  };
};

it('the census schedule un-decides nothing', () => {
  setSubscriptions({});
  expect(replay(CONFIG, SCHEDULE, 'bye-from-holder')).toBeNull();
});

it('the exit waits in the Backdraw semi-final, and nothing goes on past it', () => {
  const find = play('bye-from-holder-late', [...SCHEDULE, CONVERGING]);

  const semiFinal = find('Backdraw|5|1');
  expect(semiFinal.matchUpStatus).toEqual(WALKOVER);
  expect(semiFinal.winningSide).toBeUndefined();
  expect((semiFinal.drawPositions ?? []).filter(Boolean)).toEqual([]);

  // the Backdraw final holds only the Main final's loser, and nobody has crossed into the decider from it
  const final = find('Backdraw|6|1');
  expect(final.sides.some((side: any) => side?.bye)).toEqual(false);
  expect((final.drawPositions ?? []).filter(Boolean)).toHaveLength(1);
  expect(find('Main|5|1').sides.filter((side: any) => side?.participantId)).toHaveLength(1);
});

it('scoring the other semi-final feeder reaches the draw the forward order reaches', () => {
  const keys = ['Backdraw|4|1', 'Backdraw|4|2', 'Backdraw|5|1', 'Backdraw|6|1', 'Main|5|1'];
  const late = play('bye-from-holder-last', [...SCHEDULE, CONVERGING, PLAYED]);
  const lateStates = keys.map((key) => state(late, key));
  const forward = play('bye-from-holder-first', [...SCHEDULE, PLAYED, CONVERGING]);
  expect(lateStates).toEqual(keys.map((key) => state(forward, key)));
  expect(lateStates[2].winningSide).toEqual(2);
});
