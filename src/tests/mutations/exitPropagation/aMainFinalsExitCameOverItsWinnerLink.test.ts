import { getDrawMatchUps, observeMutation, clearOutcome } from '@Tests/testHarness/exitPropagation/transitions';
import { getDrawDefinition, projectDraw } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import { setSubscriptions } from '@Global/state/globalState';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * THE MAIN FINAL'S EXIT CAME OVER ITS WINNER LINK (census A1 int2 dpws, DOUBLE_ELIMINATION 8/5 seed 21033335; 59 of the
 * 192 rows were this shape, every one `Main|4|1` or `Main|5|1`).
 *
 * `Main|3|1`'s double walkover produces a walkover that waits, pending, in `Main|4|1` for the Backdraw's winner. A
 * double walkover at `Backdraw|3|1` converges with it there; cleared, `getUnwoundState` re-derives `Main|4|1` to the
 * kept walkover and asks `producedAwardStands` whether its award to the empty Backdraw seat stands. That asked
 * `arrivedOverLoserLink`, whose walk follows winner links from the source's LOSER target: in a double-elimination draw
 * `Main|3|1`'s loser target is `Backdraw|4|1`, whose winner target is `Main|4|1` itself, so the produced exit read as
 * one carried down a loser link and kept its award to nobody. The source's own winner target is where its produced
 * exit went first. "A produced exit has no winningSide until a participant arrives" (CA, 2026-09-20).
 */

type Step = { structureName: string; roundNumber: number; roundPosition: number; outcome: any };
const at = (key: string, outcome: any): Step => {
  const [structureName, roundNumber, roundPosition] = key.split('|');
  return { structureName, roundNumber: Number(roundNumber), roundPosition: Number(roundPosition), outcome };
};
const coordinate = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;
const find = (drawId: string, key: string) =>
  getDrawMatchUps(drawId).find((matchUp: any) => coordinate(matchUp) === key);

// the legacy `matchUpStatusCodes` are left out: they are F1's, exempt from the round trip and counted on their own ledger
const withoutCodes = (projection: any[]) =>
  projection.map((structure) => ({
    ...structure,
    matchUps: structure.matchUps.map((row: any[]) => row.filter((_: any, index: number) => index !== 4)),
  }));
const CONFIG = {
  drawType: DOUBLE_ELIMINATION,
  propagateExitStatus: true,
  participantsCount: 5,
  drawSize: 8,
  seed: 21033335,
};
const STANDING = [
  at('Main|1|3', { winningSide: 2 }),
  at('Main|2|2', { winningSide: 1 }),
  at('Main|2|1', { matchUpStatus: WALKOVER, winningSide: 2 }),
  at('Main|3|1', { matchUpStatus: DOUBLE_WALKOVER }),
];
const PROBE = at('Backdraw|3|1', { matchUpStatus: DOUBLE_WALKOVER });

function enter(drawId: string, step: Step) {
  const { matchUpId } = find(drawId, coordinate(step));
  const observed = observeMutation({ propagateExitStatus: true, matchUpId, outcome: step.outcome, drawId });
  expect(observed.error).toBeUndefined();
  return matchUpId;
}

it("a Backdraw double walkover cleared leaves the Main final's produced walkover pending", () => {
  setSubscriptions({});
  const drawId = 'main-final-exit-over-winner-link';
  expect(prepareDraw(CONFIG, drawId)).toEqual(true);
  for (const step of STANDING) enter(drawId, step);
  const forward = withoutCodes(projectDraw(getDrawDefinition(drawId)));

  // the produced walkover waits for the Backdraw's winner, awarded to nobody
  expect(find(drawId, 'Main|4|1').matchUpStatus).toEqual(WALKOVER);
  expect(find(drawId, 'Main|4|1').winningSide).toBeUndefined();

  const matchUpId = enter(drawId, PROBE);
  // the two exits converge in the final
  expect(find(drawId, 'Main|4|1').matchUpStatus).toEqual(DOUBLE_WALKOVER);

  const cleared = observeMutation({ propagateExitStatus: true, matchUpId, outcome: clearOutcome, drawId });
  expect(cleared.error).toBeUndefined();
  expect(find(drawId, 'Main|4|1').matchUpStatus).toEqual(WALKOVER);
  expect(find(drawId, 'Main|4|1').winningSide).toBeUndefined();
  // and the whole draw is the one the standing results reach
  expect(withoutCodes(projectDraw(getDrawDefinition(drawId)))).toEqual(forward);
});
