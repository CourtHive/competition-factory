import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL, TEAM } from '@Constants/participantConstants';
import { ANY, MALE } from '@Constants/genderConstants';
import { SINGLES } from '@Constants/eventConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

it('can generateDrawDefinition a main structure, then generate a qualifying structure with a different tieFormat saved to the structure', () => {
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

  const qualifyingCollectionName = 'Qualifying Collection';
  const qualifyingTieFormatName = 'QUALIFYING_TF';
  const qualifyingTieFormat = {
    tieFormatName: qualifyingTieFormatName,
    collectionDefinitions: [
      {
        collectionName: qualifyingCollectionName,
        category: { ageCategoryCode: 'U18' },
        matchUpFormat: 'SET3-S:6/TB7',
        collectionId: 'Q-collection1',
        matchUpType: DOUBLES,
        collectionOrder: 1,
        matchUpValue: 1,
        matchUpCount: 3,
        gender: ANY,
      },
    ],
    winCriteria: { valueGoal: 2, success: true },
  };

  const mainCollectionName = 'Main Collection';
  const mainTieFormatName = 'MAIN_TF';
  const mainTieFormat = {
    tieFormatName: mainTieFormatName,
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

  const drawEntries = [
    ...mainParticipantIds.map((p, i) => ({
      entryStatus: 'DIRECT_ACCEPTANCE',
      entryPosition: i + 1,
      entryStage: 'MAIN',
      participantId: p,
    })),
    ...qualifyingParticipantIds.slice(0, 2).map((p, i) => ({
      entryStatus: 'DIRECT_ACCEPTANCE',
      entryStage: 'QUALIFYING',
      entryPosition: i + 1,
      participantId: p,
    })),
  ];

  const { drawDefinition: mainDrawDefinition } = tournamentEngine.generateDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    structureOptions: { groupSize: 4 },
    ignoreAllowedDrawTypes: true,
    qualifyingPlaceholder: true,
    hydrateCollections: true,
    tieFormat: mainTieFormat,
    qualifyingSeedsCount: 0,
    ignoreStageSpace: true,
    qualifyingDrawSize: 4,
    qualifiersCount: 2,
    eventId: eventId,
    automated: true,
    drawSize: 16,
    drawEntries,
  });

  tournamentEngine.addDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    drawDefinition: mainDrawDefinition,
    allowReplacement: true,
    eventId,
  });

  // verify main structure has been created with tieFormat at drawDefinition level and not on structure level
  const mainStructure = mainDrawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.matchUps.length).toEqual(15);
  expect(mainStructure.matchUps[0].tieMatchUps.length).toEqual(2);
  expect(mainStructure.tieFormat).toBeUndefined();
  expect(mainDrawDefinition.tieFormat.collectionDefinitions.length).toEqual(1);
  expect(mainDrawDefinition.tieFormat.collectionDefinitions[0].collectionName).toEqual(mainCollectionName);
  expect(mainDrawDefinition.tieFormat.collectionDefinitions[0].collectionId).toEqual(
    mainTieFormat.collectionDefinitions[0].collectionId,
  );

  const { drawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [{ structureProfiles: [{ qualifyingPositions: 2, drawSize: 4 }] }],
    activeTournamentId: tournamentRecord.tournamentId,
    drawId: mainDrawDefinition.drawId,
    tieFormat: qualifyingTieFormat,
    ignoreStageSpace: true,
    automated: true,
    drawEntries,
    eventId,
  });

  result = tournamentEngine.addDrawDefinition({
    activeTournamentId: tournamentRecord.tournamentId,
    allowReplacement: true,
    drawDefinition,
    eventId,
  });

  expect(result.success).toEqual(true);

  // reverify main structure has been created with tieFormat at drawDefinition level and not on structure level
  const newMainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(newMainStructure.matchUps.length).toEqual(15);
  expect(newMainStructure.matchUps[0].tieMatchUps.length).toEqual(2);
  expect(newMainStructure.tieFormat).toBeUndefined();

  expect(drawDefinition.tieFormat.tieFormatName).toEqual(mainTieFormatName);
  expect(drawDefinition.tieFormat.collectionDefinitions.length).toEqual(1);
  expect(drawDefinition.tieFormat.collectionDefinitions[0].collectionName).toEqual(mainCollectionName);
  expect(drawDefinition.tieFormat.collectionDefinitions[0].collectionId).toEqual(
    mainTieFormat.collectionDefinitions[0].collectionId,
  );

  // verify qualifying structure has been created with tieFormat at structure level
  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(qualifyingStructure.tieFormat.tieFormatName).toEqual(qualifyingTieFormatName);
  expect(qualifyingStructure.tieFormat.collectionDefinitions[0].collectionName).toEqual(qualifyingCollectionName);
  expect(qualifyingStructure.matchUps.length).toEqual(2);
  expect(qualifyingStructure.matchUps[0].tieMatchUps.length).toEqual(3);
  expect(qualifyingStructure.tieFormat.collectionDefinitions.length).toEqual(1);
  expect(qualifyingStructure.tieFormat.collectionDefinitions[0].collectionName).toEqual(qualifyingCollectionName);
  expect(qualifyingStructure.tieFormat.collectionDefinitions[0].collectionId).toEqual(
    qualifyingTieFormat.collectionDefinitions[0].collectionId,
  );

  const qualifyingMatchUp = tournamentEngine
    .allTournamentMatchUps({ contextFilters: { structureIds: [qualifyingStructure.structureId] } })
    .matchUps.find((m) => !!m.tieMatchUps);
  expect(qualifyingMatchUp.structureId).toEqual(qualifyingStructure.structureId);
  expect(qualifyingMatchUp.tieFormat.tieFormatName).toEqual(qualifyingTieFormatName);
  expect(qualifyingStructure.tieFormat.collectionDefinitions[0].collectionId).toEqual(
    qualifyingMatchUp.tieMatchUps[0].collectionId,
  );
});
