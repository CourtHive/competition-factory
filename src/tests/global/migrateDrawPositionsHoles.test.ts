import { migrateTournamentRecord } from '@Mutate/tournaments/migrateTournamentRecord';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { SINGLE_ELIMINATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

/**
 * A STORED `drawPositions` HOLE IS COMPACTED BY `migrateTournamentRecord`, AND NO SIDE MOVES (leading-hole step 3).
 *
 * Since 7.7.0 no writer stores a hole (CA's Q2 ruling, 2026-10-05: `tournament.schema.json` admits no `null`). Records
 * written before may hold `[undefined, 5]`, `[5, null]` or `[null]`. The engine reads them structurally already; the
 * migration makes them validate. The sides a consumer hydrates must be the same before and after.
 */

const key = (m: any) => `${m.structureName}|${m.roundNumber}|${m.roundPosition}`;
const drawId = 'holes';

function recordWithHoles() {
  const { tournamentRecord }: any = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: SINGLE_ELIMINATION,
        drawSize: 8,
        drawId,
        outcomes: [
          { roundNumber: 1, roundPosition: 1, matchUpStatus: DOUBLE_WALKOVER },
          { roundNumber: 1, roundPosition: 2, winningSide: 2, scoreString: '6-1 6-2' },
          { roundNumber: 1, roundPosition: 3, winningSide: 1, scoreString: '6-1 6-2' },
        ],
      },
    ],
  });
  const matchUps = tournamentRecord.events[0].drawDefinitions[0].structures[0].matchUps;
  const at = (roundNumber: number, roundPosition: number) =>
    matchUps.find((m: any) => m.roundNumber === roundNumber && m.roundPosition === roundPosition);
  // the shapes records written before 7.7.0 can hold
  const lone21 = at(2, 1).drawPositions.filter(Boolean)[0]; // 1|2's winner, side 2
  const lone22 = at(2, 2).drawPositions.filter(Boolean)[0]; // 1|3's winner, side 1
  at(2, 1).drawPositions = [undefined, lone21];
  at(2, 2).drawPositions = [lone22, null];
  at(3, 1).drawPositions = [null];
  return { tournamentRecord, at, lone21, lone22 };
}

const hydratedSides = (tournamentRecord: any) => {
  tournamentEngine.setState(structuredClone(tournamentRecord));
  return Object.fromEntries(
    (tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? []).map((m: any) => [
      key(m),
      (m.sides ?? []).map((side: any) => `${side.sideNumber}:${side.drawPosition ?? '-'}:${side.participantId ?? '.'}`),
    ]),
  );
};

it('compacts every stored hole, counts it, and leaves a settled array alone', () => {
  const { tournamentRecord, at, lone21, lone22 } = recordWithHoles();
  const settledBefore = [...at(1, 4).drawPositions];

  const result: any = migrateTournamentRecord({ tournamentRecord });
  expect(result.success).toEqual(true);
  expect(result.promoted.drawPositions).toEqual(3);
  expect(at(2, 1).drawPositions).toEqual([lone21]);
  expect(at(2, 2).drawPositions).toEqual([lone22]);
  expect(at(3, 1).drawPositions).toEqual([]);
  // CONTROL: a two-position array is already settled and untouched
  expect(at(1, 4).drawPositions).toEqual(settledBefore);

  // idempotent
  expect((migrateTournamentRecord({ tournamentRecord }) as any).promoted.drawPositions).toEqual(0);
});

it('moves no side: what a consumer hydrates is the same before and after', () => {
  const { tournamentRecord } = recordWithHoles();
  const before = hydratedSides(tournamentRecord);
  // CONTROL: the side-2 survivor is on side 2 while the hole is still stored
  expect(before['Main|2|1'].some((side: string) => side.startsWith('2:'))).toEqual(true);

  migrateTournamentRecord({ tournamentRecord });
  expect(hydratedSides(tournamentRecord)).toEqual(before);
});
