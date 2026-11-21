import { getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { runMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { expect, it } from 'vitest';
// constants and types
import { USTA_INTERSECTIONAL, USTA_OZAKI_CUP } from '@Constants/tieFormatConstants';
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { MatchUp } from '@Types/tournamentTypes';
import { TEAM } from '@Constants/eventConstants';
const variants = [
  { seed: 93309, tieFormatName: USTA_OZAKI_CUP, exitStatus: DEFAULTED },
  { seed: 93312, tieFormatName: USTA_INTERSECTIONAL, exitStatus: WALKOVER },
];
const sizes = process.env.OUTCOME_EXTERNAL_STALL_PROBE === 'shrink' ? [4, 8] : [8];
const cells = variants.flatMap((variant) => sizes.map((size) => ({ ...variant, size })));

it.skipIf(!process.env.OUTCOME_EXTERNAL_STALL_PROBE).each(cells)('$tieFormatName, $size positions', (cell) => {
  const drawId = `ext-${cell.seed}`;
  const failures = runMatrixCell(
    {
      ...cell,
      drawType: SINGLE_ELIMINATION,
      drawSize: cell.size,
      participantsCount: cell.size - 1,
      propagateExitStatus: true,
      lineUps: true,
      eventType: TEAM,
    },
    drawId,
  );
  const duals: MatchUp[] = getDrawMatchUps(drawId);
  const terminal = duals
    .filter((matchUp) => matchUp.tieMatchUps?.length)
    .map((dual) => ({
      round: dual.roundNumber,
      position: dual.roundPosition,
      status: dual.matchUpStatus,
      sides: dual.sides?.filter((side) => side.participantId).length,
      winner: dual.winningSide,
      lines: dual.tieMatchUps?.map((line) => [
        line.matchUpStatus,
        line.winningSide ?? null,
        line.sides?.filter((side) => side.participantId).length ?? 0,
      ]),
      score: dual.score?.scoreStringSide1,
    }));
  expect(failures, JSON.stringify({ failures, terminal })).toEqual([]);
});
