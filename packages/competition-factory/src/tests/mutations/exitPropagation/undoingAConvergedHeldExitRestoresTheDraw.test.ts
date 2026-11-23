import {
  getDrawDefinition,
  getDrawMatchUps,
  observeMutation,
  clearOutcome,
} from '@Tests/testHarness/exitPropagation/transitions';
import { MATRIX_CELLS } from '@Tests/testHarness/exitPropagation/matrixCells';
import { nextPlayable, playForward } from '@Tests/testHarness/exitPropagation/driver';
import { setSubscriptions } from '@Global/state/globalState';
import { projectDraw } from '@Tests/testHarness/exitPropagation/transitions';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';

/**
 * Undoing the double exit whose held exit converged downstream puts the draw back exactly as it was.
 *
 * Matrix FMLC 8/8 DOUBLE_WALKOVER (the `transitionProperties` do/undo cell). After five steps `Consolation|3|1` holds a
 * pending WALKOVER on side 1, nobody on either side. A DOUBLE_WALKOVER at `Consolation|1|2` makes its loser target a BYE
 * holder, whose held exit is sent on into `3|1`, where the two exits converge (DOUBLE_WALKOVER). Clearing `1|2`
 * withdraws that exit again, and `3|1` is re-derived to the pending WALKOVER it was. The re-derivation used to award
 * side 2, a seat nobody had reached: a PRODUCED exit has no winner until a participant arrives (CA, 2026-09-20).
 */
const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;

it('clearing the double exit re-derives the convergence to the pending exit it met, with no winner', () => {
  const cell: any = MATRIX_CELLS.find(
    (c: any) =>
      c.drawType === FIRST_MATCH_LOSER_CONSOLATION &&
      c.drawSize === 8 &&
      c.participantsCount === 8 &&
      c.exitStatus === DOUBLE_WALKOVER &&
      c.propagateExitStatus === true,
  );
  expect(cell).toBeDefined();
  setSubscriptions({});
  const drawId = 'undo-converged-held-exit';
  mocksEngine.generateTournamentRecord({
    drawProfiles: [
      { drawId, drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount },
    ],
    nonRandom: cell.seed,
    setState: true,
  });
  const outcome = { matchUpStatus: DOUBLE_WALKOVER };
  playForward({ propagateExitStatus: true, exitOutcome: outcome, maxSteps: 5, drawId });
  const target: any = nextPlayable(drawId);
  expect(key(target)).toEqual('Consolation|1|2');

  // CONTROL: the semifinal holds a pending produced walkover, nobody on either side, no winner
  const find = (k: string) => getDrawMatchUps(drawId).find((m: any) => key(m) === k);
  const pending = find('Consolation|3|1');
  expect(pending.matchUpStatus).toEqual(WALKOVER);
  expect(pending.winningSide).toBeUndefined();
  expect(pending.sides.some((side: any) => side.participantId)).toBe(false);
  const before = JSON.stringify(projectDraw(getDrawDefinition(drawId)));

  const applied = observeMutation({ propagateExitStatus: true, matchUpId: target.matchUpId, drawId, outcome });
  expect(applied.error).toBeUndefined();
  // the held exit was sent on and converged here
  expect(find('Consolation|3|1').matchUpStatus).toEqual(DOUBLE_WALKOVER);

  const cleared = observeMutation({
    propagateExitStatus: true,
    matchUpId: target.matchUpId,
    drawId,
    outcome: clearOutcome,
  });
  expect(cleared.error).toBeUndefined();
  const after = find('Consolation|3|1');
  expect(after.matchUpStatus).toEqual(WALKOVER);
  expect(after.winningSide).toBeUndefined();
  expect(JSON.stringify(projectDraw(getDrawDefinition(drawId)))).toEqual(before);
});
