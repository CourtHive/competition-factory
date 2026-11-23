import { MATRIX_CELLS, playMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import { getDrawInconsistencies } from '@Query/drawDefinition/getDrawInconsistencies';
import { STALLED_POSITION } from '@Query/drawDefinition/getStructureInconsistencies';
import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import tournamentEngine from '@Engines/syncEngine';
import { isDoubleExit } from '@Validators/isExit';
import { expect, it } from 'vitest';

/**
 * A CARRIED EXIT THAT MEETS AN EXIT CONVERGES, AND THE DOUBLE EXIT PRODUCES ONWARD (CA, 2026-10-06: "build the
 * convergence").
 *
 * With `doubleExitPropagateBye` off, the second stall budget held 11 cells and 17 findings, every one a produced exit
 * carried past a BYE into a matchUp that already held an exit on its other side. `carryExitOnward` stopped there and
 * `getHeldExit` declined to send, so the carried exit arrived as a bare empty seat and the exit opposite waited for an
 * opponent who could never come. Each cell below is one part of the fix, and fails without it:
 *
 *  - FIRST_MATCH_LOSER_CONSOLATION 16/13, seed 177: the held exit is sent into the convergence (`getHeldExit`).
 *  - COMPASS 16/13, seed 537: the BYE's own advancement had recorded an arrival on the seat the exit travels to; that
 *    is not a delivery standing in its way.
 *  - MODIFIED_FEED_IN_CHAMPIONSHIP 16/16, seed 277: the converged matchUp first withdraws the walkover it produced as a
 *    single pending exit; producing over it converged the next matchUp with itself and stranded a real winner.
 *  - DOUBLE_ELIMINATION 16/13, seed 117: the four-stall chain the budget's liveness rested on.
 */

const CASES = [
  { name: 'FMLC 16/13 seed 177', seed: 177, converged: 'Consolation|3|1' },
  { name: 'COMPASS 16/13 seed 537', seed: 537, converged: 'West|2|1' },
  { name: 'MFIC 16/16 seed 277', seed: 277, converged: 'Consolation|3|2' },
  { name: 'DE 16/13 seed 117', seed: 117, converged: 'Backdraw|3|2' },
];

const key = (matchUp: any) => `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`;

it.each(CASES)('$name: the exits converge, and nobody is left stranded', ({ seed, converged }) => {
  const drawId = `converge-${seed}`;
  const cell = MATRIX_CELLS.find((candidate) => candidate.seed === seed);
  expect(playMatrixCell(cell as any, drawId, 'exits', PRODUCED_EXIT_POLICY)).toEqual(true);

  const matchUp: any = getDrawMatchUps(drawId).find((candidate: any) => key(candidate) === converged);
  expect(isDoubleExit(matchUp.matchUpStatus)).toEqual(true);
  expect(matchUp.winningSide).toBeUndefined();
  for (const sideNumber of [1, 2]) expect(matchUp.sideExitProvenance?.[sideNumber]?.matchUpStatus).toBeDefined();

  const drawDefinition: any = tournamentEngine.getEvent({ drawId }).drawDefinition;
  const result: any = getDrawInconsistencies({ drawDefinition, drawId });
  expect((result.inconsistencies ?? []).filter((issue: any) => issue.issueType === STALLED_POSITION)).toEqual([]);
  expect((result.inconsistencies ?? []).filter((issue: any) => issue.severity === 'error')).toEqual([]);
});
