import { MATRIX_CELLS, cellExitOutcome } from '@Tests/testHarness/exitPropagation/matrixCells';
import { PRODUCED_EXIT_POLICY } from '@Tests/testHarness/exitPropagation/producedExitPolicy';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import type { MatrixCell } from '@Tests/testHarness/exitPropagation/matrixCells';
import { setStateProvider, setSubscriptions } from '@Global/state/globalState';
import { nextPlayable } from '@Tests/testHarness/exitPropagation/driver';
import syncGlobalState from '@Global/state/syncGlobalState';
import { hasStoredGoesTo } from '@Query/matchUps/addGoesTo';
import * as governors from '@Assemblies/governors';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import asyncEngine from '@Engines/asyncEngine';
import { describe, expect, it } from 'vitest';

// constants
import { INVALID_WINNING_SIDE } from '@Constants/errorConditionConstants';

/**
 * A DRAW STORED WITHOUT `winnerMatchUpId` / `loserMatchUpId` PLAYS OUT AS THE SAME DRAW.
 *
 * Draws the factory generates store those edges. A record from elsewhere may not — an older record,
 * a file the factory did not produce — and the exit cascade reads the STORED ids to decide. Until
 * `setMatchUpStatus` wrote them before deciding anything, such a draw was repaired only if a cascade
 * happened to place a BYE: measured 2026-10-01, a hundred matrix cells at 16/13 played with the ids
 * stripped ended in a different draw 14 times.
 *
 * Each cell here is played twice on the matrix's own schedule — intact, and with every stored edge
 * deleted before the draw is loaded — and the two must end in the same draw, with the same refusals.
 */

const CELLS = MATRIX_CELLS.filter(
  (cell) => cell.drawSize === 16 && cell.participantsCount === 13 && cell.propagateExitStatus,
);

function stripEdges(tournamentRecord: any): number {
  let stripped = 0;
  for (const structure of tournamentRecord.events[0].drawDefinitions[0].structures) {
    for (const matchUp of structure.matchUps ?? []) {
      if (matchUp.winnerMatchUpId || matchUp.loserMatchUpId) stripped += 1;
      delete matchUp.winnerMatchUpId;
      delete matchUp.loserMatchUpId;
    }
  }
  return stripped;
}

function play(cell: MatrixCell, policy: any, strip: boolean) {
  setSubscriptions({});
  const drawId = 'edges';
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    ...(policy ? { policyDefinitions: policy } : {}),
    drawProfiles: [
      { drawType: cell.drawType, drawSize: cell.drawSize, participantsCount: cell.participantsCount, drawId },
    ],
    nonRandom: cell.seed,
  });
  const stripped = strip ? stripEdges(tournamentRecord) : 0;
  tournamentEngine.setState(tournamentRecord);

  const exit = cellExitOutcome(cell.exitStatus);
  const skip = new Set<string>();
  const refusals: string[] = [];
  for (let taken = 0; taken < 200; taken++) {
    const target = nextPlayable(drawId, skip);
    if (!target) break;
    const result: any = tournamentEngine.setMatchUpStatus({
      outcome: taken === 0 || taken % 3 === 2 ? exit : { winningSide: 1 },
      propagateExitStatus: cell.propagateExitStatus,
      matchUpId: target.matchUpId,
      drawId,
    });
    if (!result.success) {
      skip.add(target.matchUpId);
      refusals.push(result.error?.code);
    }
  }

  const matchUps: any[] = tournamentEngine.allDrawMatchUps({ drawId, inContext: true }).matchUps ?? [];
  const signature = matchUps
    .map((matchUp) =>
      [
        `${matchUp.structureName}|${matchUp.roundNumber}|${matchUp.roundPosition}`,
        matchUp.matchUpStatus,
        `ws=${matchUp.winningSide ?? '-'}`,
        `dp=${(matchUp.drawPositions ?? []).map((position: any) => position ?? '_').join('.')}`,
      ].join(' '),
    )
    .sort((a, b) => a.localeCompare(b));
  return { signature, refusals, stripped, drawDefinition: tournamentEngine.getEvent({ drawId }).drawDefinition };
}

it.each([
  { name: 'a double exit produces a BYE', policy: undefined },
  { name: 'a double exit produces an exit', policy: PRODUCED_EXIT_POLICY },
])(
  'fifty matrix cells end in the same draw with their stored edges deleted ($name)',
  ({ policy }) => {
    // CONTROL: ten draw types, five exit statuses
    expect(CELLS).toHaveLength(50);

    const differing: string[] = [];
    for (const cell of CELLS) {
      const intact = play(cell, policy, false);
      const bare = play(cell, policy, true);

      // CONTROL: there were edges, they were deleted, and the play was not empty
      expect(bare.stripped).toBeGreaterThan(0);
      expect(intact.signature.length).toBeGreaterThan(0);
      // the first score stores them again, and they stay
      expect(hasStoredGoesTo({ drawDefinition: bare.drawDefinition })).toEqual(true);

      const moved = intact.signature.filter((line, index) => line !== bare.signature[index]);
      if (moved.length || intact.refusals.join() !== bare.refusals.join()) {
        differing.push(`${cell.drawType} ${cell.exitStatus}: ${moved.length} matchUps, e.g. ${moved[0]}`);
      }
    }
    expect(differing).toEqual([]);
  },
  180_000,
);

/**
 * A REFUSED CALL STORES NONE OF THE MISSING EDGES.
 *
 * CA, 2026-10-18: "no, a refused call does not store a draw's missing edges. v1 should no longer do so." A case of
 * CA's earlier ruling the same day: "In setMatchUpStatus there should be nothing changed if an error is returned".
 *
 * v1 writes a draw's missing edges once, before anything is decided on them (#5086), because the cascade decides on
 * the STORED ids. What that write touched is held, and written back on any error the call returns, so a refusal
 * leaves the record exactly as it was, edges included. A call that succeeds keeps them, and the draw stores its edges
 * from then on. Asked through every engine entry that reaches `setMatchUpStatus`.
 */
describe('a call that is refused stores none of the missing edges', () => {
  const NINE_ALL = { winningSide: 1, score: { sets: [{ side1Score: 9, side2Score: 9 }] } };

  function bareDraw() {
    setSubscriptions({});
    const [cell] = CELLS;
    const { tournamentRecord } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawType: cell.drawType, drawSize: 8, drawId: 'refused' }],
      nonRandom: 1,
    });
    expect(stripEdges(tournamentRecord)).toBeGreaterThan(0);
    return tournamentRecord;
  }
  const storesEdges = () =>
    hasStoredGoesTo({ drawDefinition: tournamentEngine.getEvent({ drawId: 'refused' }).drawDefinition });
  const recordNow = () => structuredClone(tournamentEngine.getTournament().tournamentRecord);

  it('directly: a refusal before the draw is read, and one after it, leave the record as it was', () => {
    tournamentEngine.setState(bareDraw());
    expect(storesEdges()).toEqual(false);
    const before = recordNow();

    // a refusal taken BEFORE the draw is read
    const target = nextPlayable('refused');
    let result: any = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 3 },
      matchUpId: target.matchUpId,
      drawId: 'refused',
    });
    expect(result.error).toEqual(INVALID_WINNING_SIDE);
    expect(storesEdges()).toEqual(false);
    expect(recordNow()).toEqual(before);

    // a refusal taken AFTER it: a score its format cannot produce
    result = tournamentEngine.setMatchUpStatus({ outcome: NINE_ALL, matchUpId: target.matchUpId, drawId: 'refused' });
    expect(result.error).toBeDefined();
    expect(storesEdges()).toEqual(false);
    const { drawDefinition } = tournamentEngine.getEvent({ drawId: 'refused' });
    const stored = drawDefinition.structures[0].matchUps.find((matchUp: any) => matchUp.matchUpId === target.matchUpId);
    expect(stored.winningSide).toBeUndefined();
    expect(stored.score?.sets ?? []).toEqual([]);
    expect(recordNow()).toEqual(before);

    // POSITIVE CONTROL: the same matchUp scored as it can be scored stores the edges, and they stay
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({ scoreString: '6-1 6-1', winningSide: 1 });
    result = tournamentEngine.setMatchUpStatus({
      outcome,
      matchUpId: target.matchUpId,
      drawId: 'refused',
    });
    expect(result.success).toEqual(true);
    expect(storesEdges()).toEqual(true);
  });

  for (const rollbackOnError of [true, false]) {
    it(`setMatchUpStatus and executionQueue, rollbackOnError ${rollbackOnError}: the record is as it was`, () => {
      for (const via of ['direct', 'executionQueue'] as const) {
        tournamentEngine.setState(bareDraw());
        const before = recordNow();
        const params = { outcome: NINE_ALL, matchUpId: nextPlayable('refused').matchUpId, drawId: 'refused' };
        const result: any =
          via === 'direct'
            ? tournamentEngine.setMatchUpStatus({ ...params, rollbackOnError })
            : tournamentEngine.executionQueue([{ method: 'setMatchUpStatus', params }], rollbackOnError);
        expect(result.error).toBeDefined();
        expect(storesEdges()).toEqual(false);
        expect(recordNow()).toEqual(before);
      }
    });
  }

  it('bulkMatchUpStatusUpdate: an outcome refused leaves the draw it was refused in as it was', () => {
    const tournamentRecord = bareDraw();
    tournamentEngine.setState(tournamentRecord);
    const before = recordNow();
    const { eventId } = tournamentEngine.getEvent({ drawId: 'refused' }).event;
    const result: any = tournamentEngine.bulkMatchUpStatusUpdate({
      outcomes: [
        {
          ...NINE_ALL,
          tournamentId: tournamentRecord.tournamentId,
          matchUpId: nextPlayable('refused').matchUpId,
          drawId: 'refused',
          eventId,
        },
      ],
    });
    expect(result.error).toBeDefined();
    expect(storesEdges()).toEqual(false);
    expect(recordNow()).toEqual(before);
  });

  it('async engine: the same, per request context', async () => {
    const tournamentRecord = bareDraw();
    tournamentEngine.setState(structuredClone(tournamentRecord));
    const matchUpId = nextPlayable('refused').matchUpId;
    setStateProvider(asyncGlobalState);
    try {
      asyncEngine.importMethods(governors);
      for (const rollbackOnError of [true, false]) {
        await asyncGlobalState.runWithInstanceState(async () => {
          await asyncEngine.setState(structuredClone(tournamentRecord));
          const before = structuredClone((await asyncEngine.getTournament()).tournamentRecord);
          const result: any = await asyncEngine.setMatchUpStatus({
            outcome: NINE_ALL,
            drawId: 'refused',
            rollbackOnError,
            matchUpId,
          });
          expect(result.error).toBeDefined();
          const { drawDefinition } = await asyncEngine.getEvent({ drawId: 'refused' });
          expect(hasStoredGoesTo({ drawDefinition })).toEqual(false);
          const { tournamentRecord: after } = await asyncEngine.getTournament();
          expect(after).toEqual(before);
        });
      }
    } finally {
      setStateProvider(syncGlobalState);
    }
  });
});
