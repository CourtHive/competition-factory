import { matchUpsOf, positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { expect, test } from 'vitest';

// types
import type { Structure } from '@Types/tournamentTypes';

const matchUps = [{ matchUpId: 'm1', drawPositions: [1, 2] }];
const positionAssignments = [{ drawPosition: 1 }];

test('an item as stored, with no structureType, reads exactly as the property does', () => {
  const item: Structure = { structureId: 'item', matchUps, positionAssignments };
  expect(matchUpsOf(item)).toBe(item.matchUps);
  expect(positionAssignmentsOf(item)).toBe(item.positionAssignments);
  expect(structuresOf(item)).toBe(item.structures);
  expect(structuresOf(item)).toBeUndefined();
});

test('a container reads its structures and nothing else, exactly as the property does', () => {
  const group: Structure = { structureId: 'group', structureType: 'ITEM', matchUps };
  const container: Structure = { structureId: 'container', structureType: 'CONTAINER', structures: [group] };
  expect(structuresOf(container)).toBe(container.structures);
  expect(matchUpsOf(container)).toBe(container.matchUps);
  expect(matchUpsOf(container)).toBeUndefined();
  expect(positionAssignmentsOf(container)).toBeUndefined();
});

test('a legacy record with structures but no structureType is still read by presence', () => {
  // stored data predating `structureType`: the accessor must not reinterpret it by type
  const legacy = { structureId: 'legacy', structures: [] } as unknown as Structure;
  expect(structuresOf(legacy)).toEqual([]);
  expect(matchUpsOf(legacy)).toBeUndefined();
});

test('a missing structure reads as undefined, like an optional chain', () => {
  expect(matchUpsOf(undefined)).toBeUndefined();
  expect(positionAssignmentsOf(undefined)).toBeUndefined();
  expect(structuresOf(undefined)).toBeUndefined();
});

test('a key present with an undefined value reads as undefined, as the property does', () => {
  const item: Structure = { structureId: 'item', matchUps: undefined };
  expect(matchUpsOf(item)).toBeUndefined();
});
