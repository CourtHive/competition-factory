import { TEAM_EXTENSION_DUAL_CELLS, runMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { expect, test } from 'vitest';

/**
 * THE TEAM ARM OVER THE SEVEN EXTENSION DRAW TYPES, DUAL LEVEL: no lineups, every exit on a dual.
 *
 * Composed in `matrixCells.ts` (§ THE TEAM ARM, EXTENDED), from a seed base of its own so that no
 * existing cell's draw moves. Same per-cell body as `teamMatrix.test.ts` (`runMatrixCell`): the exit
 * on the first playable matchUp, the matrix's periodic schedule, every property per step, then the
 * integrity check.
 *
 * INERT unless `TEAM_ARMS=1`: `pnpm verify:team-arms`, a `slow-gates` job in CI. The four extended
 * arms cost ~10 minutes locally between them, which the coverage run would multiply by four. One file
 * per arm so they run in parallel; one file of ~1,000 TEAM cells slowed to a crawl near its end when
 * measured (2026-10-05). The composition control below runs on every `pnpm test`.
 */

const enabled = process.env.TEAM_ARMS === '1';
const CELLS = TEAM_EXTENSION_DUAL_CELLS;

// CONTROL: the composition covers what it says
test('composes 400 cells, each with its own seed', () => {
  expect(CELLS).toHaveLength(400);
  expect(new Set(CELLS.map((cell) => cell.seed)).size).toEqual(400);
});

test.skipIf(!enabled).for(CELLS)(
  'team $tieFormatName lines=$lineUps $drawType $drawSize/$participantsCount $exitStatus propagate=$propagateExitStatus',
  (cell) => {
    const failures = runMatrixCell(cell, `team-${cell.seed}`);
    expect(failures, 'nothing playable').toBeDefined();
    const report = (failures ?? []).map((f) => `${f.property} @ ${f.matchUpId.slice(0, 8)}\n  ${f.detail}`).join('\n');
    expect(report).toEqual('');
  },
  180_000,
);
