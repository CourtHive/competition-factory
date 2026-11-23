import { TEAM_EXTENSION_LINE_CELLS, TEAM_FORMAT_CELLS, runMatrixCell } from './matrixCells';
import { registerTestSeedIdentity } from '@Tests/testHarness/seedMathRandom';
import { expect, test } from 'vitest';

// constants and types
import { COLLEGE_DEFAULT, LAVER_CUP } from '@Constants/tieFormatConstants';
import type { MatrixCell } from './matrixCells';

type TeamArm = 'ExtensionLine' | 'CollegeDefault' | 'LaverCup';
const title =
  'team $tieFormatName lines=$lineUps $drawType $drawSize/$participantsCount $exitStatus propagate=$propagateExitStatus';
const renderedTitle = (cell: MatrixCell) =>
  title.replace(/\$([A-Za-z][A-Za-z0-9_]*)/g, (_match, key: keyof MatrixCell) => String(cell[key]));

/** Partition already-seeded cells, retaining original order, assertion body and effective test RNG identity. */
export function registerTeamArm(arm: TeamArm, partition: number, count: number) {
  const expectedCount = arm === 'LaverCup' ? 6 : 4;
  if (count !== expectedCount || !Number.isInteger(partition) || partition < 0 || partition >= count)
    throw new Error('Invalid TEAM arm partition');
  const cells =
    arm === 'ExtensionLine'
      ? TEAM_EXTENSION_LINE_CELLS
      : TEAM_FORMAT_CELLS.filter(
          (cell) => cell.tieFormatName === (arm === 'CollegeDefault' ? COLLEGE_DEFAULT : LAVER_CUP),
        );
  const selected = cells.filter((cell) => cell.seed % count === partition);
  const occurrences = new Map<string, number>();
  const originalOrdinals = new Map<string, number[]>();
  for (const cell of cells) {
    const name = renderedTitle(cell);
    const ordinal = (occurrences.get(name) ?? 0) + 1;
    occurrences.set(name, ordinal);
    if (cell.seed % count === partition) originalOrdinals.set(name, [...(originalOrdinals.get(name) ?? []), ordinal]);
  }
  registerTestSeedIdentity(
    `src/tests/mutations/exitPropagation/teamMatrix${arm}.part${partition}.test.ts`,
    (name, occurrence) => {
      const ordinal = originalOrdinals.get(name)?.[occurrence - 1];
      if (!ordinal) throw new Error('TEAM partition test identity is not in its original registration');
      return { name: `src/tests/mutations/exitPropagation/teamMatrix${arm}.test.ts::${name}`, ordinal };
    },
  );
  test.skipIf(process.env.TEAM_ARMS !== '1').for(selected)(title, { timeout: 180_000 }, (cell) => {
    const failures = runMatrixCell(cell, `team-${cell.seed}`);
    expect(failures, 'nothing playable').toBeDefined();
    const report = (failures ?? []).map((f) => `${f.property} @ ${f.matchUpId.slice(0, 8)}\n  ${f.detail}`).join('\n');
    expect(report).toEqual('');
  });
}
