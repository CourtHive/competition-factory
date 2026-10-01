import { quarantineFor, unusedQuarantineKeys } from '@Tests/testHarness/exitPropagation/knownFailures';
import { afterAll, expect, test } from 'vitest';
import {
  MATRIX_EXTENSION_CELLS,
  MATRIX_EXTENSION_DRAW_TYPES,
  runMatrixCell,
  cellLabel,
} from '@Tests/testHarness/exitPropagation/matrixCells';

/**
 * THE MATRIX OVER THE DRAW TYPES THE 600 NEVER EXERCISED — assessment gaps G1 and G12.
 *
 * `ROUND_ROBIN` and `ROUND_ROBIN_WITH_PLAYOFF` (the container branch of `doubleExitAdvancement`
 * returned at once and was never executed by any oracle; a group's exit decides who reaches the
 * playoff), `FEED_IN_CHAMPIONSHIP_TO_QF` / `_R16`, `LUCKY_DRAW` (its own placement branches),
 * `FEED_IN` and `PLAYOFF`. Same sizes, reductions, exit statuses and propagation flags as the matrix;
 * same per-cell body (`runMatrixCell`); its own seed range and its own quarantine prefix.
 *
 * Measured 2026-10-01 on first contact: 400 of 400 cells clean, and the deep-correction oracle read
 * 640 identical / 0 severe over the same types. So this file adds no known defect. It exists so those
 * branches are executed by the gate rather than assumed clean — the same reason the 600 exist.
 *
 * `LUCKY_DRAW` at reduction 3 is excluded at composition (unpopulated by `mocksEngine`); see
 * `matrixCells.ts`. Every remaining cell must play: a cell that generates nothing playable is a
 * harness bug, asserted loudly rather than skipped.
 */

const observedKeys = new Set<string>();
const extensionLabel = (cell: (typeof MATRIX_EXTENSION_CELLS)[number]) => `ext ${cellLabel(cell)}`;

// CONTROL: the composition covers every type it names, and excludes only what it says it excludes
test('the extension composes 400 cells over seven draw types', () => {
  expect(MATRIX_EXTENSION_DRAW_TYPES).toHaveLength(7);
  expect(MATRIX_EXTENSION_CELLS).toHaveLength(7 * 60 - 20);
  expect(new Set(MATRIX_EXTENSION_CELLS.map((cell) => cell.seed)).size).toEqual(MATRIX_EXTENSION_CELLS.length);
});

test.for(MATRIX_EXTENSION_CELLS)(
  'ext $drawType $drawSize/$participantsCount $exitStatus propagate=$propagateExitStatus',
  (cell) => {
    const key = extensionLabel(cell);
    observedKeys.add(key);

    const failures = runMatrixCell(cell, `ext-${cell.seed}`);
    expect(failures, `${key}: nothing playable`).toBeDefined();

    const quarantined = quarantineFor(key);
    const unexpected = (failures ?? []).filter((failure) => !quarantined.includes(failure.property));
    if (unexpected.length) {
      const report = unexpected.map((f) => `${f.property} @ ${f.matchUpId.slice(0, 8)}\n  ${f.detail}`).join('\n');
      expect(`${key}\n${report}`).toEqual(key);
    }

    const stillFailing = new Set((failures ?? []).map((failure) => failure.property));
    expect(quarantined.filter((property) => !stillFailing.has(property))).toEqual([]);
  },
);

afterAll(() => {
  expect(unusedQuarantineKeys(observedKeys, 'ext matrix ')).toEqual([]);
});
