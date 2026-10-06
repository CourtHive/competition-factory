import { structureSort } from '@Functions/sorters/structureSort';
import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, test } from 'vitest';

// constants and types
import { ItemStructure, MatchUp, MatchUpStatusUnion, PositionAssignment, Structure } from '@Types/tournamentTypes';
import { CONTAINER, ITEM, MAIN, ROUND_ROBIN_WITH_PLAYOFF } from '@Constants/drawDefinitionConstants';
import { COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

const matchUp = (matchUpId: string, matchUpStatus: MatchUpStatusUnion): MatchUp => ({
  matchUpId,
  matchUpStatus,
  drawPositions: [],
});
const positions = (count: number): PositionAssignment[] =>
  Array.from({ length: count }, (_, i) => ({ drawPosition: i + 1 }));

const item = (structureId: string, matchUps: MatchUp[], positionsCount = 4): ItemStructure => ({
  positionAssignments: positions(positionsCount),
  stageSequence: 1,
  stage: MAIN,
  structureId,
  matchUps,
});

const container = (structureId: string, groups: Structure[]): Structure => ({
  structureType: CONTAINER,
  structures: groups,
  stageSequence: 1,
  stage: MAIN,
  structureId,
});

const group = (structureId: string, matchUps: MatchUp[], positionsCount = 4): Structure => ({
  ...item(structureId, matchUps, positionsCount),
  structureType: ITEM,
});

test('deprioritizeCompleted sorts a completed structure after one still in play', () => {
  const completed = item('completed', [matchUp('m1', COMPLETED), matchUp('m2', COMPLETED)]);
  const inPlay = item('inPlay', [matchUp('m3', COMPLETED), matchUp('m4', TO_BE_PLAYED)]);

  expect(structureSort(completed, inPlay, { deprioritizeCompleted: true })).toBeGreaterThan(0);
  expect(structureSort(inPlay, completed, { deprioritizeCompleted: true })).toBeLessThan(0);
});

test('deprioritizeCompleted reads a round robin container through its groups', () => {
  const completed = container('completed', [group('g1', [matchUp('m1', COMPLETED)])]);
  const inPlay = container('inPlay', [
    group('g2', [matchUp('m2', COMPLETED)]),
    group('g3', [matchUp('m3', TO_BE_PLAYED)]),
  ]);

  expect(structureSort(completed, inPlay, { deprioritizeCompleted: true })).toBeGreaterThan(0);
  expect(structureSort(inPlay, completed, { deprioritizeCompleted: true })).toBeLessThan(0);
});

test('a round robin container sorts by its groups positionAssignments', () => {
  // more positionAssignments sort first; a container of one group of 4 has 4, not Infinity
  const smallContainer = container('container', [group('g1', [], 4)]);
  const largerItem = item('item', [], 8);

  expect(structureSort(smallContainer, largerItem)).toBeGreaterThan(0);
  expect(structureSort(largerItem, smallContainer)).toBeLessThan(0);
});

test('getEventData can deprioritize completed structures in a round robin draw', () => {
  const {
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawType: ROUND_ROBIN_WITH_PLAYOFF, drawSize: 8 }],
    setState: true,
  });

  const result: any = tournamentEngine.getEventData({ eventId, sortConfig: { deprioritizeCompleted: true } });
  expect(result.success).toEqual(true);
  expect(result.eventData.drawsData[0].structures.length).toEqual(2);
});
