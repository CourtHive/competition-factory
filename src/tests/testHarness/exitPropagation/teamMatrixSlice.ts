import { quarantineFor, unusedQuarantineKeys } from '@Tests/testHarness/exitPropagation/knownFailures';
import { TEAM_DUAL_CELLS, TEAM_LINE_CELLS, runMatrixCell, cellLabel } from './matrixCells';
import { afterAll, expect, test } from 'vitest';

// constants and types
import type { MatrixCell } from './matrixCells';

/** every TEAM-arm cell's name, as the quarantine registry keys it */
export const teamLabel = (cell: MatrixCell): string => `team ${cellLabel(cell)}`;

/** one arm of the TEAM matrix for one draw type: the cells a slice file runs */
export function teamMatrixSlice(arm: 'dual' | 'line', drawType: string): MatrixCell[] {
  return (arm === 'dual' ? TEAM_DUAL_CELLS : TEAM_LINE_CELLS).filter((cell) => cell.drawType === drawType);
}

/**
 * Register one slice of the TEAM matrix as tests (see `teamMatrix.test.ts` for what the matrix is).
 *
 * The matrix is split into one file per arm and draw type because vitest shards by FILE: as a single
 * file its ~578s (2026-10-05) pinned one CI coverage shard to 12-20 minutes while the others took 6-9.
 * Each slice checks its OWN quarantine entries are still observed; `teamMatrix.test.ts` checks that no
 * `team matrix` quarantine key names a cell outside every slice.
 */
export function runTeamMatrixSlice(arm: 'dual' | 'line', drawType: string): void {
  const cells = teamMatrixSlice(arm, drawType);
  const sliceKeys = new Set(cells.map(teamLabel));
  const observedKeys = new Set<string>();

  // CONTROL: the slice is not empty, so a renamed draw type cannot pass vacuously
  test(`the TEAM ${arm} arm holds 60 ${drawType} cells`, () => {
    expect(cells).toHaveLength(60);
  });

  test.for(cells)(
    'team $eventType $drawType $drawSize/$participantsCount $exitStatus propagate=$propagateExitStatus lines=$lineUps',
    { timeout: 180_000 },
    (cell) => {
      const key = teamLabel(cell);
      observedKeys.add(key);

      const failures = runMatrixCell(cell, `team-${cell.seed}`);
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
    const unused = unusedQuarantineKeys(observedKeys, 'team matrix ').filter((key) => sliceKeys.has(key));
    expect(unused).toEqual([]);
  });
}
