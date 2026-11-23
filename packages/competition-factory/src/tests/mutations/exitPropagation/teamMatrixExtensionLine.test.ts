import { TEAM_EXTENSION_LINE_CELLS } from '@Tests/testHarness/exitPropagation/matrixCells';
import { expect, test } from 'vitest';

/**
 * THE TEAM ARM OVER THE SEVEN EXTENSION DRAW TYPES, LINE LEVEL: lineups attached, exits on lines and duals.
 *
 * Composed in `matrixCells.ts` (§ THE TEAM ARM, EXTENDED), from a seed base of its own so that no
 * existing cell's draw moves. Same per-cell body as `teamMatrix.test.ts` (`runMatrixCell`): the exit
 * on the first playable matchUp, the matrix's periodic schedule, every property per step, then the
 * integrity check.
 *
 * INERT unless `TEAM_ARMS=1`: `pnpm verify:team-arms`, a `slow-gates` job in CI. The four extended
 * arms cost ~10 minutes locally between them, which the coverage run would multiply by four. Cell-only partition files share the unchanged registration helper; this original file retains its control. The composition control below runs on every `pnpm test`.
 */

const CELLS = TEAM_EXTENSION_LINE_CELLS;

// CONTROL: the composition covers what it says
test('composes 400 cells, each with its own seed', () => {
  expect(CELLS).toHaveLength(400);
  expect(new Set(CELLS.map((cell) => cell.seed)).size).toEqual(400);
});
