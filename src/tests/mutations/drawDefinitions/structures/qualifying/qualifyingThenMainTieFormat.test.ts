import tournamentEngine from '@Engines/syncEngine';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';

// Constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';
import { MALE } from '@Constants/genderConstants';
import { SINGLES } from '@Constants/eventConstants';

it('can generate qualifying and main structures with different tieFormats', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantType: TEAM, participantsCount: 40 },
    eventProfiles: [{ eventName: 'test', eventType: TEAM }],
  });

  const individualParticipants = tournamentRecord.participants.filter((p) => p.participantType === INDIVIDUAL);
  const teamParticipants = tournamentRecord.participants.filter((p) => p.participantType === TEAM);

  expect(individualParticipants.length).toEqual(320);
  expect(teamParticipants.length).toEqual(40);

  tournamentEngine.setState(tournamentRecord);

  const participantIds = teamParticipants.map((p) => p.participantId);
  const mainParticipantIds = participantIds.slice(0, 14);
  const qualifyingParticipantIds = participantIds.slice(14, 28);

  let result = tournamentEngine.addEventEntries({
    participantIds: mainParticipantIds,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addEventEntries({
    participantIds: qualifyingParticipantIds,
    entryStage: QUALIFYING,
    eventId,
  });
  expect(result.success).toEqual(true);

  const mainCollectionName = 'Main Collection';
  const mainTieFormat = {
    tieFormatName: 'CUSTOM',
    collectionDefinitions: [
      {
        category: { ageCategoryCode: 'U18' },
        collectionName: mainCollectionName,
        matchUpFormat: 'SET3-S:6/TB7',
        collectionId: 'M-collection1',
        matchUpType: SINGLES,
        collectionOrder: 1,
        matchUpValue: 1,
        matchUpCount: 2,
        gender: MALE,
      },
    ],
    winCriteria: { valueGoal: 2, success: true },
  };

  // Generate both qualifying and main in a single call
  // Main tieFormat is at drawDefinition level; qualifying tieFormat at structure level
  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    tieFormat: mainTieFormat,
    qualifyingProfiles: [
      {
        structureProfiles: [
          {
            matchUpFormat: 'SET1-S:TB11NOAD',
            qualifyingPositions: 2,
            seedsCount: 0,
            drawSize: 16,
          },
        ],
      },
    ],
    drawSize: 16,
    automated: true,
    eventId,
  });

  expect(drawDefinition).not.toBeUndefined();

  // Verify main structure has been created with tieFormat at drawDefinition level
  const mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure).not.toBeUndefined();
  expect(mainStructure.matchUps.length).toEqual(15);
  expect(mainStructure.matchUps[0].tieMatchUps.length).toEqual(2);
  expect(mainStructure.tieFormat).toBeUndefined();
  expect(drawDefinition.tieFormat.collectionDefinitions.length).toEqual(1);
  expect(drawDefinition.tieFormat.collectionDefinitions[0].collectionName).toEqual(mainCollectionName);
  expect(drawDefinition.tieFormat.collectionDefinitions[0].collectionId).toEqual(
    mainTieFormat.collectionDefinitions[0].collectionId,
  );

  // Verify qualifying structure exists and has correct structure
  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(qualifyingStructure).not.toBeUndefined();
  expect(qualifyingStructure.matchUps.length).toEqual(14);
  // Main tieFormat propagates to qualifying matchUps when no structure-level tieFormat override
  expect(qualifyingStructure.matchUps[0].tieMatchUps.length).toEqual(2);
});
