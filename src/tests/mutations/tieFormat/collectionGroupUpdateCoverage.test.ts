import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_SCORING } from '@Constants/policyConstants';
import { USTA_BREWER_CUP } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

const policyDefinitions = { [POLICY_TYPE_SCORING]: { requireParticipantsForScoring: false } };

describe('collectionGroupUpdate and related operations coverage', () => {
  it('removeCollectionGroup returns error for missing collectionGroupNumber', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.removeCollectionGroup({
      collectionGroupNumber: 0,
      drawId,
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('removeCollectionGroup returns error for NaN collectionGroupNumber', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.removeCollectionGroup({
      collectionGroupNumber: Number.NaN,
      drawId,
    });
    expect(result.error).toBeDefined();
  });

  it('addCollectionGroup returns error when collectionIds is not an array', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.addCollectionGroup({
      groupDefinition: { groupName: 'Test', groupValue: 1, winCriteria: { valueGoal: 1 } },
      collectionIds: 'not-an-array' as any,
      drawId,
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('addCollectionGroup returns error when collection already belongs to a group', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    // Get a collection that already has a collectionGroupNumber
    const groupedDef = event.tieFormat.collectionDefinitions.find((def) => def.collectionGroupNumber);
    expect(groupedDef).toBeDefined();

    const result = tournamentEngine.addCollectionGroup({
      groupDefinition: { groupName: 'New', groupValue: 1, winCriteria: { valueGoal: 1 } },
      collectionIds: [groupedDef.collectionId],
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('removeCollectionGroup on event level with tieFormatName', () => {
    const {
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.removeCollectionGroup({
      tieFormatName: 'Custom Name',
      collectionGroupNumber: 1,
      eventId,
    });
    expect(result.success).toEqual(true);
    expect(result.modifiedCollectionIds.length).toBeGreaterThan(0);
  });

  it('addCollectionGroup on event level', () => {
    const {
      drawIds: [drawId],
      eventIds: [eventId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    // First remove the existing group
    let result = tournamentEngine.removeCollectionGroup({
      tieFormatName: 'No Group',
      collectionGroupNumber: 1,
      eventId,
    });
    expect(result.success).toEqual(true);

    const { event } = tournamentEngine.getEvent({ drawId });
    // Get collections that are no longer grouped
    const ungroupedDefs = event.tieFormat.collectionDefinitions.filter((def) => !def.collectionGroupNumber);
    const collectionIds = ungroupedDefs.slice(0, 2).map((def) => def.collectionId);

    result = tournamentEngine.addCollectionGroup({
      groupDefinition: { groupName: 'New Group', groupValue: 1, winCriteria: { valueGoal: 1 } },
      tieFormatName: 'With Group',
      collectionIds,
      eventId,
    });
    expect(result.success).toEqual(true);
  });

  it('removeCollectionGroup on structure level', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event, drawDefinition } = tournamentEngine.getEvent({ drawId });
    const structureId = drawDefinition.structures[0].structureId;
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    // Modify structure to give it a tieFormat with a collectionGroup
    const modResult = tournamentEngine.modifyCollectionDefinition({
      collectionName: 'Struct Modified',
      collectionId,
      structureId,
      drawId,
    });
    expect(modResult.success).toEqual(true);

    // Now remove the group at structure level
    const result = tournamentEngine.removeCollectionGroup({
      tieFormatName: 'Struct No Group',
      collectionGroupNumber: 1,
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.modifiedCollectionIds.length).toBeGreaterThan(0);
  });

  it('collectionGroupUpdate handles matchUp level assignment', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 4, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
      policyDefinitions,
    });

    tournamentEngine.setState(tournamentRecord);

    const matchUps = tournamentEngine.allTournamentMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM] },
    }).matchUps;
    const matchUpId = matchUps[0].matchUpId;

    // Add a collection to the matchUp so it gets its own tieFormat
    let result = tournamentEngine.addCollectionDefinition({
      collectionDefinition: {
        collectionName: 'Extra',
        matchUpFormat: 'SET3-S:6/TB7',
        matchUpType: 'SINGLES',
        matchUpCount: 1,
        matchUpValue: 1,
      },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Remove the group at matchUp level
    result = tournamentEngine.removeCollectionGroup({
      collectionGroupNumber: 1,
      tieFormatName: 'MatchUp No Group',
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  it('collectionGroupUpdate handles valueGoal change without tieFormatName', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    // Remove group without providing tieFormatName
    const result = tournamentEngine.removeCollectionGroup({
      collectionGroupNumber: 1,
      drawId,
    });
    expect(result.success).toEqual(true);
    // tieFormatName should be deleted since valueGoal changed
    expect(result.modifiedCollectionIds.length).toBeGreaterThan(0);
  });

  it('addCollectionGroup and then removeCollectionGroup on draw level', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    // Remove existing group first
    let result = tournamentEngine.removeCollectionGroup({
      tieFormatName: 'Clean Slate',
      collectionGroupNumber: 1,
      drawId,
    });
    expect(result.success).toEqual(true);

    const { drawDefinition } = tournamentEngine.getEvent({ drawId });
    const collectionIds = drawDefinition.tieFormat.collectionDefinitions.slice(0, 2).map((def) => def.collectionId);

    // Add a new group
    result = tournamentEngine.addCollectionGroup({
      groupDefinition: {
        groupName: 'New Doubles Group',
        groupValue: 2,
        winCriteria: { valueGoal: 2 },
      },
      tieFormatName: 'With New Group',
      collectionIds,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Verify and remove
    const { drawDefinition: updated } = tournamentEngine.getEvent({ drawId });
    expect(updated.tieFormat.collectionGroups.length).toEqual(1);

    result = tournamentEngine.removeCollectionGroup({
      tieFormatName: 'Group Removed Again',
      collectionGroupNumber: updated.tieFormat.collectionGroups[0].groupNumber,
      drawId,
    });
    expect(result.success).toEqual(true);
  });
});
