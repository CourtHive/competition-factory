import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it, describe } from 'vitest';

// constants
import { INVALID_VALUES, MISSING_VALUE, NOT_FOUND } from '@Constants/errorConditionConstants';
import { COLLEGE_D3, USTA_BREWER_CUP } from '@Constants/tieFormatConstants';
import { TEAM } from '@Constants/eventConstants';

describe('modifyCollectionDefinition additional branch coverage', () => {
  it('returns INVALID_VALUES for invalid matchUpFormat', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const result = tournamentEngine.modifyCollectionDefinition({
      matchUpFormat: 'INVALID_FORMAT',
      collectionId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES for non-string collectionName', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const result = tournamentEngine.modifyCollectionDefinition({
      collectionName: 123 as any,
      collectionId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES for invalid gender', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const result = tournamentEngine.modifyCollectionDefinition({
      gender: 'INVALID_GENDER' as any,
      collectionId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns INVALID_VALUES for non-object category', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const result = tournamentEngine.modifyCollectionDefinition({
      category: 'not-an-object' as any,
      collectionId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns MISSING_VALUE when no modification params provided', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const result = tournamentEngine.modifyCollectionDefinition({
      collectionId,
      drawId,
    });
    expect(result.error).toEqual(MISSING_VALUE);
  });

  it('returns INVALID_VALUES when multiple value assignments provided', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const result = tournamentEngine.modifyCollectionDefinition({
      matchUpValue: 1,
      collectionValue: 2,
      collectionId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });

  it('returns NOT_FOUND for nonexistent collectionId', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const result = tournamentEngine.modifyCollectionDefinition({
      collectionId: 'nonexistent-collection-id',
      matchUpValue: 1,
      drawId,
    });
    expect(result.error).toEqual(NOT_FOUND);
  });

  it('can modify gender on a collectionDefinition', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    // gender alone is not sufficient - need another modification param
    const result = tournamentEngine.modifyCollectionDefinition({
      collectionName: 'With Gender',
      gender: 'FEMALE',
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  it('can modify category on a collectionDefinition', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    // category alone is not sufficient - need another modification param
    const result = tournamentEngine.modifyCollectionDefinition({
      category: { ageCategoryCode: 'U18' },
      collectionName: 'With Category',
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  it('can modify collectionOrder on a collectionDefinition', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const result = tournamentEngine.modifyCollectionDefinition({
      collectionOrder: 2,
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.modifications.length).toBeGreaterThan(0);
  });

  it('returns success with no modifications when no values actually change', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const def = event.tieFormat.collectionDefinitions[0];

    // Use the same matchUpValue that already exists
    const result = tournamentEngine.modifyCollectionDefinition({
      matchUpValue: def.matchUpValue,
      collectionId: def.collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
    // modifications should be empty since nothing changed
    expect(result.modifications).toEqual([]);
  });

  it('removes collectionGroup when scoreValue is set on a collection with collectionGroupNumber', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: USTA_BREWER_CUP }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    // Find a collection that's part of a collectionGroup
    const groupedDef = event.tieFormat.collectionDefinitions.find((def) => def.collectionGroupNumber);
    expect(groupedDef).toBeDefined();

    const result = tournamentEngine.modifyCollectionDefinition({
      collectionId: groupedDef.collectionId,
      scoreValue: 1,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat.collectionGroups.length).toEqual(0);
  });

  it('modifies tieFormat with tieFormatName when provided', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const result = tournamentEngine.modifyCollectionDefinition({
      tieFormatName: 'Custom Format Name',
      collectionName: 'Updated Name',
      collectionId,
      drawId,
    });
    expect(result.success).toEqual(true);
    expect(result.tieFormat.tieFormatName).toEqual('Custom Format Name');
  });

  it('returns INVALID_VALUES for non-integer value', () => {
    const {
      drawIds: [drawId],
      tournamentRecord,
    } = mocksEngine.generateTournamentRecord({
      drawProfiles: [{ drawSize: 2, eventType: TEAM, tieFormatName: COLLEGE_D3 }],
    });

    tournamentEngine.setState(tournamentRecord);

    const { event } = tournamentEngine.getEvent({ drawId });
    const collectionId = event.tieFormat.collectionDefinitions[0].collectionId;

    const result = tournamentEngine.modifyCollectionDefinition({
      matchUpValue: 1.5,
      collectionId,
      drawId,
    });
    expect(result.error).toEqual(INVALID_VALUES);
  });
});
