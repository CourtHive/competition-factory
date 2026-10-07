import { MATRIX_CELLS, playMatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { getDrawDefinition, getDrawMatchUps } from '@Tests/testHarness/exitPropagation/transitions';
import { prepareDraw } from '@Tests/testHarness/exitPropagation/sweep';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPASS } from '@Constants/drawDefinitionConstants';

/**
 * A STORED `drawPositions` holds no hole: the positions present, ascending, or `[]`.
 *
 * Step 2 of `Mentat/planning/LEADING_HOLE_REMOVAL_DESIGN.md` (CA, Q2, 2026-10-05: `tournament.schema.json` types the
 * items as `number`, and a stored hole serialises as `null`). A lone survivor on side 2 used to be stored
 * `[undefined, 5]`; since every reader resolves a side structurally (#5253), it is stored `[5]`.
 *
 * Read from STORED state, not hydrated matchUps, which drop and pad. The matrix cells play a draw to exhaustion after
 * an exit, through the BYE advancements, releases and substitutions that wrote the hole, in every draw type.
 */
const holes = (drawId: string): string[] => {
  const found: string[] = [];
  const walk = (structures: any[]) => {
    for (const structure of structures ?? []) {
      for (const matchUp of structure.matchUps ?? []) {
        const positions: any[] = matchUp.drawPositions ?? [];
        const sorted = positions.every((position, index) => !index || positions[index - 1] < position);
        if (positions.some((position) => !position) || !sorted)
          found.push(
            `${structure.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition} ${JSON.stringify(positions)}`,
          );
      }
      walk(structure.structures);
    }
  };
  walk(getDrawDefinition(drawId).structures);
  return found;
};

// every draw type, both exits, both propagation settings: a spread of the 600 matrix cells
const cells = MATRIX_CELLS.filter((cell: any) => cell.seed % 15 === 0);

it('the matrix sample spans the draw types', () => {
  expect(new Set(cells.map((cell: any) => cell.drawType)).size).toBeGreaterThan(5);
});

it.each(cells)('$drawType $drawSize/$participantsCount $exitStatus stores no hole (cell $seed)', (cell: any) => {
  const drawId = `no-hole-${cell.seed}`;
  expect(playMatrixCell(cell, drawId)).toEqual(true);
  expect(holes(drawId)).toEqual([]);
});

/**
 * Census w1 9000016 (COMPASS 32/30, propagation off), its first 12 steps. Before step 2, undoing `East|1|12`'s double
 * walkover as a RETIRED result (step 12) left `North|2|2` and `South|2|2` stored as `[null, 7]`: 74 of the window's 600
 * seeds stored a leading hole at some step.
 */
it('census w1 9000016 stores no hole at any step, and its lone survivor reads on the side it holds', () => {
  const drawId = 'no-hole-9000016';
  const config = { participantsCount: 30, propagateExitStatus: false, drawSize: 32, drawType: COMPASS, seed: 9000016 };
  expect(prepareDraw(config as any, drawId)).toEqual(true);
  const steps: [string, any][] = [
    ['East|1|15', { matchUpStatus: 'DOUBLE_DEFAULT' }],
    ['East|1|8', { winningSide: 2 }],
    ['East|1|4', { matchUpStatus: 'WALKOVER', winningSide: 1 }],
    ['East|1|12', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' }],
    ['East|1|8', { winningSide: 1 }],
    ['East|1|10', { winningSide: 1 }],
    ['East|1|7', { score: { scoreStringSide1: '', scoreStringSide2: '' }, matchUpStatus: 'TO_BE_PLAYED' }],
    ['East|1|6', { winningSide: 2 }],
    ['East|1|11', { winningSide: 2 }],
    ['East|1|12', { matchUpStatus: 'DOUBLE_WALKOVER' }],
    ['East|1|11', { winningSide: 2 }],
    [
      'East|1|12',
      {
        matchUpStatus: 'RETIRED',
        winningSide: 1,
        score: { sets: [{ side1Score: 6, side2Score: 3 }], scoreStringSide1: '6-3', scoreStringSide2: '3-6' },
      },
    ],
  ];
  const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
  for (const [k, outcome] of steps) {
    const target = getDrawMatchUps(drawId).find((m: any) => key(m) === k);
    // the census's own rule: a step is played only on a matchUp holding two participants
    if ((target?.sides ?? []).filter((side: any) => side?.participantId).length !== 2) continue;
    tournamentEngine.setMatchUpStatus({ matchUpId: target.matchUpId, propagateExitStatus: false, outcome, drawId });
    expect(holes(drawId), k).toEqual([]);
  }
  // CONTROL: North|2|2 holds a lone survivor, the shape that used to keep a leading hole
  const lone = getDrawMatchUps(drawId).find((m: any) => key(m) === 'North|2|2');
  const present = lone.sides.filter((side: any) => side.drawPosition);
  expect(present.length).toEqual(1);
  // its side is the one its position holds structurally: the same answer the hole used to give
  expect(present[0].sideNumber).toEqual(2);
});
