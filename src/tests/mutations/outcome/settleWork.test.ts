import { predictSettleWork } from '@Mutate/matchUps/outcome/settleWork';
import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants and types
import { COMPLETED, WALKOVER } from '@Constants/matchUpStatusConstants';
import type { OutcomeOp } from '@Mutate/matchUps/outcome/ops';

/**
 * S2's HAS-WORK PREDICATES (`outcome/settleWork.ts`): asked of the working view, the draw as a plan's ops leave it. In
 * S2, v2 owns a call only if none is true. Their agreement with v1's per-pass writes is the census's to measure
 * (`settlePredictions.ts`, `s2:missed:<site>` must be 0); this file holds the contract on a draw built for it.
 */
function firstRound({ plant }: { plant?: (record: any) => void } = {}) {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 16, drawId: 'd' }], nonRandom: 1, setState: true });
  const { tournamentRecord } = tournamentEngine.getTournament();
  plant?.(tournamentRecord);
  const event = tournamentRecord.events[0];
  const drawDefinition = event.drawDefinitions[0];
  const matchUpsMap = getMatchUpsMap({ drawDefinition });
  const inContextDrawMatchUps = getAllDrawMatchUps({
    tournamentRecord,
    drawDefinition,
    matchUpsMap,
    inContext: true,
    event,
  }).matchUps as any[];
  const first = inContextDrawMatchUps.find((matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1);
  const next = inContextDrawMatchUps.find((matchUp) => matchUp.matchUpId === first.winnerMatchUpId);
  const winnerPosition = first.sides.find((side: any) => side.sideNumber === 1).drawPosition;
  const predict = (matchUpStatus: any) => {
    const ops: OutcomeOp[] = [
      { op: 'setMatchUpResult', matchUpId: first.matchUpId, matchUpStatus, winningSide: 1 },
      { op: 'setMatchUpDrawPositions', matchUpId: next.matchUpId, drawPositions: [winnerPosition] },
    ];
    const working = createWorkingView({ inContextDrawMatchUps, tournamentRecord, drawDefinition, matchUpsMap, event });
    expect(working.apply(ops).error).toBeUndefined();
    return predictSettleWork({ inContextDrawMatchUps, tournamentRecord, drawDefinition, working, event, ops });
  };
  return { predict, inContextDrawMatchUps };
}

it('predicts no work for a first-round result on a draw with nothing left over', () => {
  expect(firstRound().predict(COMPLETED)).toEqual([]);
});

it('sees leftover state the write did not cause: a stale scoredTime on an unscored matchUp', () => {
  const { predict } = firstRound({
    plant: (record) => {
      const later = record.events[0].drawDefinitions[0].structures[0].matchUps.find((m: any) => m.roundNumber === 3);
      later.schedule = { ...later.schedule, scoredTime: '2026-10-24T12:00:00.000Z' };
    },
  });
  expect(predict(COMPLETED)).toEqual(['reconcileScoredTimes']);
});

it('puts every pass in reach of an exit the call writes, which is propagated', () => {
  expect(firstRound().predict(WALKOVER).length).toEqual(12);
});
