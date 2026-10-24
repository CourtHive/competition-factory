import { createWorkingView } from '@Mutate/matchUps/outcome/overlay';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { setSubscriptions } from '@Global/state/globalState';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants and types
import type { OutcomeOp } from '@Mutate/matchUps/outcome/ops';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

/**
 * THE WORKING VIEW (outcome v2 executor plan § 3.2; S2, CA 2026-10-24): the draw as a plan's ops will leave it, read
 * without writing the record. Copy on write, folded by the one reducer, re-derived locally by projection.
 *
 * Its correctness over the suite is the view oracle's (`differential`: every complete plan's working view against a
 * hydration of the shadow-applied record). This file holds the contract: the record is never written, the view shows
 * the write, and the work stays local.
 */
function firstRoundWin() {
  setSubscriptions({});
  mocksEngine.generateTournamentRecord({ drawProfiles: [{ drawSize: 32, drawId: 'd' }], nonRandom: 1, setState: true });
  const { tournamentRecord } = tournamentEngine.getTournament();
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
  const ops: OutcomeOp[] = [
    { op: 'setMatchUpResult', matchUpId: first.matchUpId, matchUpStatus: COMPLETED, winningSide: 1 },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: first.matchUpId },
    { op: 'setMatchUpDrawPositions', matchUpId: next.matchUpId, drawPositions: [winnerPosition] },
    { op: 'stampUpdatedAt', entity: 'matchUp', id: next.matchUpId },
    { op: 'stampUpdatedAt', entity: 'structure', id: first.structureId },
    { op: 'stampUpdatedAt', entity: 'drawDefinition', id: drawDefinition.drawId },
  ];
  const working = createWorkingView({ inContextDrawMatchUps, tournamentRecord, drawDefinition, matchUpsMap, event });
  return { working, ops, first, next, winnerPosition, tournamentRecord, inContextDrawMatchUps };
}

it('shows the write in the matchUps it touched, and in nothing else', () => {
  const { working, ops, first, next, winnerPosition, inContextDrawMatchUps } = firstRoundWin();
  expect(working.apply(ops).error).toBeUndefined();

  const viewed = (matchUpId: string) => working.inContextDrawMatchUps.find((m) => m.matchUpId === matchUpId) as any;
  expect(viewed(first.matchUpId).winningSide).toEqual(1);
  expect(viewed(next.matchUpId).sides.some((side: any) => side.drawPosition === winnerPosition)).toEqual(true);
  // the base hydration the view was built from is not the view: it still shows the draw as the call found it
  const base = (matchUpId: string) => inContextDrawMatchUps.find((m) => m.matchUpId === matchUpId);
  expect(base(first.matchUpId).winningSide).toBeUndefined();
  // every other entry is the base's own object
  const others = working.inContextDrawMatchUps.filter((m) => ![first.matchUpId, next.matchUpId].includes(m.matchUpId));
  expect(others.every((m) => m === base(m.matchUpId))).toEqual(true);
});

it('writes nothing to the record', () => {
  const { working, ops, tournamentRecord } = firstRoundWin();
  const before = JSON.stringify(tournamentRecord);
  working.apply(ops);
  expect(JSON.stringify(tournamentRecord)).toEqual(before);
  expect(JSON.stringify(tournamentEngine.getTournament().tournamentRecord)).toEqual(before);
});

it('keeps its work local: the matchUps written, not the draw', () => {
  const { working, ops, inContextDrawMatchUps } = firstRoundWin();
  working.apply(ops);
  // CONTROL: a draw of 31 matchUps, so a whole re-derivation would be visible
  expect(inContextDrawMatchUps.length).toEqual(31);
  expect(working.work).toEqual({ copiedMatchUps: 2, copiedStructures: 1, rederived: 2, projections: 1 });
});
