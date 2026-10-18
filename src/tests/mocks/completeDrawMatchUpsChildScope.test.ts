import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { ROUND_ROBIN } from '@Constants/drawDefinitionConstants';

/**
 * A round-robin CHILD structureId selects that group only; the CONTAINER's id selects every group.
 *
 * The child-id support (completeDrawMatchUpsStructureFilter.test.ts) mapped a child id to its
 * container, and completion then read every matchUp in the container: naming ONE group of a
 * ROUND_ROBIN 16 completed 24 matchUps across all four (measured, 2026-10-17 mocks assessment M2).
 * The existing test passes every child id and asserts only that something completed, so it could
 * not see that.
 */

const DRAW_ID = 'RR';

function roundRobin() {
  mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN, drawSize: 16, participantsCount: 16, drawId: DRAW_ID }],
    setState: true,
  });
  const { drawDefinition } = tournamentEngine.getEvent({ drawId: DRAW_ID });
  const container: any = drawDefinition?.structures?.[0];
  const childIds: string[] = (container.structures ?? []).map((structure: any) => structure.structureId);
  return { containerId: container.structureId, childIds };
}

function completedByGroup() {
  const counts: Record<string, number> = {};
  for (const matchUp of tournamentEngine.allDrawMatchUps({ inContext: true, drawId: DRAW_ID }).matchUps) {
    if (!matchUp.winningSide) continue;
    counts[matchUp.structureId] = (counts[matchUp.structureId] ?? 0) + 1;
  }
  return counts;
}

it('one child id completes that group and leaves every sibling untouched', () => {
  const { childIds } = roundRobin();
  expect(childIds.length).toEqual(4);

  const result: any = tournamentEngine.completeDrawMatchUps({ structureIds: [childIds[0]], drawId: DRAW_ID });
  expect(result.error).toBeUndefined();
  expect(result.completedCount).toEqual(6);

  const counts = completedByGroup();
  expect(counts[childIds[0]]).toEqual(6);
  for (const siblingId of childIds.slice(1)) expect(counts[siblingId]).toBeUndefined();
});

it('two child ids complete exactly those two groups', () => {
  const { childIds } = roundRobin();

  tournamentEngine.completeDrawMatchUps({ structureIds: [childIds[1], childIds[3]], drawId: DRAW_ID });

  const counts = completedByGroup();
  expect(counts[childIds[1]]).toEqual(6);
  expect(counts[childIds[3]]).toEqual(6);
  expect(counts[childIds[0]]).toBeUndefined();
  expect(counts[childIds[2]]).toBeUndefined();
});

it('the container id still completes every group', () => {
  const { containerId, childIds } = roundRobin();

  const result: any = tournamentEngine.completeDrawMatchUps({ structureIds: [containerId], drawId: DRAW_ID });
  expect(result.completedCount).toEqual(24);

  const counts = completedByGroup();
  for (const childId of childIds) expect(counts[childId]).toEqual(6);
});

it('the container id together with one child id is the whole container', () => {
  const { containerId, childIds } = roundRobin();

  const result: any = tournamentEngine.completeDrawMatchUps({
    structureIds: [containerId, childIds[0]],
    drawId: DRAW_ID,
  });
  expect(result.completedCount).toEqual(24);
});

it('a child id composes with the roundNumber filter', () => {
  const { childIds } = roundRobin();

  const result: any = tournamentEngine.completeDrawMatchUps({
    structureIds: [childIds[2]],
    roundNumber: 1,
    drawId: DRAW_ID,
  });
  // a group of four plays two matchUps per round
  expect(result.completedCount).toEqual(2);
  expect(completedByGroup()).toEqual({ [childIds[2]]: 2 });
});

it('a child id still leaves a DOUBLE_WALKOVER in that group as entered', () => {
  const { childIds } = roundRobin();
  const target: any = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find((matchUp: any) => matchUp.structureId === childIds[0]);

  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: target.matchUpId,
    drawId: DRAW_ID,
  });

  tournamentEngine.completeDrawMatchUps({ structureIds: [childIds[0]], drawId: DRAW_ID });

  const after: any = tournamentEngine
    .allDrawMatchUps({ inContext: true, drawId: DRAW_ID })
    .matchUps.find((matchUp: any) => matchUp.matchUpId === target.matchUpId);
  expect(after.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(after.winningSide).toBeUndefined();
  expect(completedByGroup()[childIds[0]]).toEqual(5);
});
