import { MATRIX_CELLS, cellLabel, playMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DEAD_RUBBER, DOUBLE_DEFAULT, DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { DOUBLE_ELIMINATION } from '@Constants/drawDefinitionConstants';

/**
 * A FINAL DECIDED BY AN ARRIVAL SETTLES ITS DECIDER TOO.
 *
 * These were the last four cells of `verify:stall-budget`, and one shape. DOUBLE_ELIMINATION 16/16
 * with double exits: the Backdraw produces no champion, so its seat in the Main final holds a
 * produced exit, and the final gets its `winningSide` when the Main champion ARRIVES — as a
 * consequence of a result entered on some other matchUp. The link seats that winner in the Decider.
 *
 * `reconcileDecider` was asked only about the matchUp that had been scored, so it never ran for this
 * final; and its rule read a final with no loser as a decider still needed. The winner sat alone in
 * a `TO_BE_PLAYED` decider that nobody could ever join.
 *
 * CA's rule, 2026-09-29, is about the client: *"set it to a DEAD_RUBBER when it is unnecessary so
 * that clients don't see TO_BE_PLAYED matchUps"*. A final with no loser has nobody to send.
 *
 * Swept under both policies, because which of them a draw runs under changes how the Backdraw's
 * missing champion is expressed and must not change the answer.
 */

const CELLS = MATRIX_CELLS.filter(
  (cell) =>
    cell.drawType === DOUBLE_ELIMINATION &&
    cell.participantsCount === 16 &&
    cell.drawSize === 16 &&
    [DOUBLE_WALKOVER, DOUBLE_DEFAULT].includes(cell.exitStatus),
);

const CASES = [
  { policy: 'default', policyDefinitions: undefined },
  { policy: 'doubleExitPropagateBye: false', policyDefinitions: PRODUCED_EXIT_POLICY },
].flatMap((policy) => CELLS.map((cell) => ({ ...policy, cell, label: cellLabel(cell) })));

// CONTROL on the sweep itself: an empty filter would pass every case below by running none
it('sweeps the four cells under both policies', () => {
  expect(CELLS.length).toEqual(4);
  expect(CASES.length).toEqual(8);
});

it.each(CASES)('$label — $policy', ({ cell, policyDefinitions }) => {
  const drawId = `arrival-${cell.seed}`;
  expect(playMatrixCell(cell, drawId, 'exits', policyDefinitions)).toEqual(true);

  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ inContext: true, drawId }).matchUps ?? [];
  const mainFinalRound = Math.max(...matchUps.filter((m) => m.structureName === 'Main').map((m) => m.roundNumber));
  const final = matchUps.find((m) => m.structureName === 'Main' && m.roundNumber === mainFinalRound);
  const decider = matchUps.find((m) => m.structureName === 'Decider');
  const participantsIn = (matchUp: any) =>
    (matchUp.sides ?? []).filter((side: any) => side.participantId).map((side: any) => side.participantId);

  // CONTROL: the arrangement under test happened. The final was WON, it holds one participant, and
  // the other side is a carried exit -- so nothing here was settled by scoring the final.
  expect(final.winningSide, 'the final is decided').toBeDefined();
  expect(participantsIn(final).length, 'by a winner who had no opponent').toEqual(1);
  expect(final.sideExitProvenance?.[3 - final.winningSide]?.sourceMatchUpId, 'the other side is an exit').toBeDefined();

  // 1. THE DECIDER SAYS IT IS NOT NEEDED
  expect(decider.matchUpStatus).toEqual(DEAD_RUBBER);
  expect(decider.winningSide).toBeUndefined();

  // 2. THE WINNER IS SEATED THERE, as both finalists are when the undefeated one wins
  expect(participantsIn(decider)).toEqual(participantsIn(final));

  // 3. AND NOBODY IS REPORTED STRANDED
  const drawDefinition: any = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const found = (getDrawInconsistencies({ drawDefinition, drawId }) as any).inconsistencies ?? [];
  expect(found.filter((finding: any) => finding.issueType === STALLED_POSITION)).toEqual([]);
});
