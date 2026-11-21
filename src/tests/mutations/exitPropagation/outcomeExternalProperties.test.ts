import {
  MATRIX_EXTENSION_DRAW_TYPES,
  MATRIX_DRAW_TYPES,
  runMatrixCell,
} from '@Tests/testHarness/exitPropagation/matrixCells';
import { expect, it } from 'vitest';
// constants and types
import { DEFAULTED, DOUBLE_WALKOVER, RETIRED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { LUCKY_DRAW, SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import type { MatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { tieFormatConstants } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';
const drawTypes = [...MATRIX_DRAW_TYPES, ...MATRIX_EXTENSION_DRAW_TYPES];
const outcomes = [WALKOVER, DEFAULTED, RETIRED, DOUBLE_WALKOVER];
const cells: MatrixCell[] = drawTypes.flatMap((drawType, index) =>
  [7, 5]
    .filter((participantsCount) => drawType !== LUCKY_DRAW || participantsCount === 7)
    .map((participantsCount, arm) => ({
      drawType,
      participantsCount,
      drawSize: 8,
      exitStatus: outcomes[(index + arm) % outcomes.length],
      propagateExitStatus: true,
      seed: 93200 + index * 2 + arm,
    })),
);
const teamCells: MatrixCell[] = Object.values(tieFormatConstants).map((tieFormatName, index) => ({
  drawType: SINGLE_ELIMINATION,
  drawSize: 8,
  participantsCount: 7,
  exitStatus: outcomes[index % outcomes.length],
  propagateExitStatus: true,
  seed: 93300 + index,
  eventType: TEAM,
  tieFormatName,
  lineUps: true,
}));

it.skipIf(process.env.OUTCOME_EXTERNAL_PROPERTIES !== '1').each([...cells, ...teamCells])(
  'audits odd fields and carried exits for $drawType seed $seed',
  (cell) => {
    const failures = runMatrixCell(cell, `ext-${cell.seed}`);
    expect(failures, JSON.stringify(failures)).toEqual([]);
  },
);
