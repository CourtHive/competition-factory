import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw, replay } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEFAULTED, DOUBLE_DEFAULT, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A CLEARED POSITION'S SIDE IS READ FROM THE STRUCTURE, AND A PRODUCED EXIT IT LEAVES BEHIND IS NOT WON BY AN EMPTY SEAT.
 *
 * Census de 9302775 (DE 16/11, propagation off), shrunk to six steps. `Backdraw|3|2` holds a lone dp 7 on side 2 and a
 * DEFAULTED produced on side 1 by `Backdraw|2|3`'s double default. Re-scoring `Main|1|7` from a double walkover to a
 * played match clears dp 7 back out of `Backdraw|3|2`. The removal read the cleared side as `indexOf + 1`, which is
 * 1 for a lone position whatever its side: it erased side 1's produced exit and kept side 2's stale entry. Read
 * structurally, side 1's exit stands; and because it is PRODUCED, it has no winningSide until somebody arrives on
 * side 2 (CA, 2026-09-20), which is the state the same results entered in their final order leave.
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (coordinate: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = coordinate.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};

const config = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: false,
  participantsCount: 11,
  seed: 9302775,
  drawSize: 16,
};
const steps = [
  at('Main|1|5', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|2|3', { winningSide: 2 }),
  at('Main|1|4', { winningSide: 1 }),
  at('Main|1|7', { matchUpStatus: DOUBLE_WALKOVER }),
  at('Backdraw|2|3', { matchUpStatus: DOUBLE_DEFAULT }),
  at('Main|1|7', { winningSide: 1 }),
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
  return find('Backdraw|3|2');
}

it('the census replay holds every property', () => {
  setSubscriptions({});
  expect(replay(config, steps, 'cleared-side')).toBeNull();
});

it("the produced exit on the side NOT cleared stands, pending, and the cleared side's entry goes", () => {
  const matchUp = play('cleared-side', steps);
  // CONTROL: the shape is reached; dp 7 sits alone on side 2 and nobody holds it
  expect(matchUp.drawPositions).toEqual([7]);
  expect(matchUp.sides.find((side: any) => side.drawPosition === 7)?.sideNumber).toEqual(2);
  expect(matchUp.sides.find((side: any) => side.drawPosition === 7)?.participantId).toBeUndefined();

  expect(matchUp.sideExitProvenance?.[1]?.matchUpStatus).toEqual(DEFAULTED);
  expect(matchUp.sideExitProvenance?.[1]?.previousMatchUpStatus).toEqual(DOUBLE_DEFAULT);
  expect(matchUp.sideExitProvenance?.[2]).toBeUndefined();
  expect(matchUp.matchUpStatus).toEqual(DEFAULTED);
  expect(matchUp.winningSide).toBeUndefined();
});

it('matches the same results entered in their final order', () => {
  const direct = play('cleared-side-direct', [...steps.slice(0, 3), steps[5], steps[4]]);
  const corrected = play('cleared-side', steps);
  expect(corrected.matchUpStatus).toEqual(direct.matchUpStatus);
  expect(corrected.winningSide).toEqual(direct.winningSide);
  // each draw mints its own matchUpIds, so the origin is compared by what it says, not where it points
  const said = (matchUp: any) => {
    const { sourceMatchUpId, ...entry } = matchUp.sideExitProvenance?.[1] ?? {};
    return { ...entry, sourced: !!sourceMatchUpId };
  };
  expect(said(corrected)).toEqual(said(direct));
});
