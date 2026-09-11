import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// constants
import { TEAM } from '@Constants/eventConstants';

// Regression: addCollectionGroup must preserve previously-added collectionGroups.
// A typo (`tieFormat.collecitonGroups`) on the write line meant the spread source
// was always undefined, so adding a second group DROPPED the first. This test
// adds two groups from disjoint collectionIds and asserts BOTH survive.
it('addCollectionGroup preserves existing collectionGroups when adding another', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ drawSize: 8, eventType: TEAM }],
  });
  tournamentEngine.setState(tournamentRecord);

  const { event } = tournamentEngine.getEvent({ eventId });
  const collectionIds = event.tieFormat.collectionDefinitions.map((c) => c.collectionId);
  // sanity: default TEAM tieFormat has multiple ungrouped collections and no groups yet
  expect(collectionIds.length).toBeGreaterThanOrEqual(2);
  expect(event.tieFormat.collectionGroups ?? []).toHaveLength(0);

  const first = tournamentEngine.addCollectionGroup({
    groupDefinition: { groupName: 'Group A', groupValue: 1 },
    collectionIds: [collectionIds[0]],
    eventId,
  });
  expect(first.success).toEqual(true);

  let updated = tournamentEngine.getEvent({ eventId }).event;
  expect(updated.tieFormat.collectionGroups).toHaveLength(1);

  const second = tournamentEngine.addCollectionGroup({
    groupDefinition: { groupName: 'Group B', groupValue: 1 },
    collectionIds: [collectionIds[1]],
    eventId,
  });
  expect(second.success).toEqual(true);

  updated = tournamentEngine.getEvent({ eventId }).event;
  // the fix: both groups present (buggy code dropped Group A → length 1)
  expect(updated.tieFormat.collectionGroups).toHaveLength(2);
  expect(updated.tieFormat.collectionGroups.map((g) => g.groupNumber).sort((a, b) => a - b)).toEqual([1, 2]);
  expect(updated.tieFormat.collectionGroups.map((g) => g.groupName).sort((a, b) => a.localeCompare(b))).toEqual([
    'Group A',
    'Group B',
  ]);

  expect(drawId).toBeDefined();
});
