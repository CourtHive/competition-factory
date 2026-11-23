import { TEAM_FORMAT_CELLS } from '@Tests/testHarness/exitPropagation/matrixCells';
import { expect, test } from 'vitest';

// constants
import { LAVER_CUP } from '@Constants/tieFormatConstants';

/**
 * THE TEAM ARM IN LAVER_CUP: the four TEAM draw types at drawSize 8, dual and line level.
 *
 * Composed in `matrixCells.ts` (§ THE TEAM ARM, EXTENDED), from a seed base of its own so that no
 * existing cell's draw moves. Same per-cell body as `teamMatrix.test.ts` (`runMatrixCell`): the exit
 * on the first playable matchUp, the matrix's periodic schedule, every property per step, then the
 * integrity check.
 *
 * INERT unless `TEAM_ARMS=1`: `pnpm verify:team-arms`, a `slow-gates` job in CI. The four extended
 * arms cost ~10 minutes locally between them, which the coverage run would multiply by four. Cell-only partition files share the unchanged registration helper; this original file retains its control. The composition control below runs on every `pnpm test`.
 */

const CELLS = TEAM_FORMAT_CELLS.filter((cell) => cell.tieFormatName === LAVER_CUP);

// CONTROL: the composition covers what it says
test('composes 240 cells, each with its own seed', () => {
  expect(CELLS).toHaveLength(240);
  expect(new Set(CELLS.map((cell) => cell.seed)).size).toEqual(240);
});
