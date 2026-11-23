import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { SINGLES } from '@Constants/eventConstants';
import { SEEDING } from '@Constants/scaleConstants';

it('can generateDrawDefinition and place qualifiers', () => {
  const {
    tournamentRecord,
    eventIds: [eventId],
  } = mocksEngine.generateTournamentRecord({
    participantsProfile: { participantsCount: 100 },
    eventProfiles: [{ eventName: 'test' }],
  });
  expect(tournamentRecord.participants.length).toEqual(100);

  tournamentEngine.setState(tournamentRecord);

  const { participants } = tournamentEngine.getParticipants({
    participantFilters: { participantTypes: [INDIVIDUAL] },
  });
  const participantIds = participants.map((p) => p.participantId);
  const mainParticipantIds = participantIds.slice(0, 12);
  const qualifyingParticipantIds = participantIds.slice(12, 28);

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

  const qualifyingSeedingScaleName = 'QS';
  const scaleValues = [1, 2, 3, 4, 5, 6, 7, 8];
  scaleValues.forEach((scaleValue, index) => {
    const scaleItem = {
      scaleName: qualifyingSeedingScaleName,
      scaleType: SEEDING,
      eventType: SINGLES,
      scaleValue,
    };
    const participantId = qualifyingParticipantIds[index];
    const result = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem,
    });
    expect(result.success).toEqual(true);
  });

  let { drawDefinition } = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [
          {
            seedingScaleName: qualifyingSeedingScaleName,
            qualifyingPositions: 4,
            seedsCount: 4,
            drawSize: 16,
          },
        ],
      },
    ],
    qualifyingOnly: true,
    eventId,
  });
  const qualifyingStructure = drawDefinition.structures.find(({ stage }) => stage === QUALIFYING);
  expect(qualifyingStructure.matchUps.length).toEqual(12);

  const participantIdDrawPositionMap = Object.assign(
    {},
    ...qualifyingStructure.positionAssignments.map(({ participantId, drawPosition }) => ({
      [participantId]: drawPosition,
    })),
  );
  let seededDrawPositions = qualifyingStructure.seedAssignments.map((assignment) => [
    assignment.seedNumber,
    participantIdDrawPositionMap[assignment.participantId],
  ]);
  let positionsSeeded = seededDrawPositions.map((seeding) => seeding[1]).sort((a, b) => a - b);
  expect(positionsSeeded).toEqual([1, 5, 9, 13]);

  let mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.matchUps.length).toEqual(0);

  drawDefinition = tournamentEngine.generateDrawDefinition({
    qualifyingProfiles: [
      {
        structureProfiles: [{ seedsCount: 4, drawSize: 16, qualifyingPositions: 4 }],
      },
    ],
    eventId,
  }).drawDefinition;

  seededDrawPositions = qualifyingStructure.seedAssignments.map((assignment) => [
    assignment.seedNumber,
    participantIdDrawPositionMap[assignment.participantId],
  ]);
  positionsSeeded = seededDrawPositions.map((seeding) => seeding[1]).sort((a, b) => a - b);
  expect(positionsSeeded).toEqual([1, 5, 9, 13]);

  mainStructure = drawDefinition.structures.find(({ stage }) => stage === MAIN);
  expect(mainStructure.matchUps.length).toEqual(15);
});
