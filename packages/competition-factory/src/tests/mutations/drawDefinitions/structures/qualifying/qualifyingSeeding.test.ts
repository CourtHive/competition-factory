import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { CLUSTER, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { RATING, SEEDING } from '@Constants/scaleConstants';
import { SINGLES } from '@Constants/eventConstants';
import { ELO } from '@Constants/ratingConstants';

const scenarios = [
  {
    qualifyingPositions: 4,
    seededDrawPositions: [
      [1, 1],
      [2, 9],
      [3, 17],
      [4, 25],
    ],
    seedsCount: 4,
    drawSize: 32,
  },
  {
    qualifyingPositions: 4,
    seededDrawPositions: [
      [1, 1],
      [2, 9],
    ],
    seedsCount: 2,
    drawSize: 32,
  },
  {
    qualifyingPositions: 2,
    seededDrawPositions: [
      [1, 1],
      [2, 17],
    ],
    seedsCount: 2,
    drawSize: 32,
  },
  {
    qualifyingPositions: 4,
    seededDrawPositions: [
      [1, 1],
      [2, 3],
    ],
    seedsCount: 2,
    drawSize: 8,
  },
  {
    qualifyingPositions: 2,
    seededDrawPositions: [
      [1, 1],
      [2, 5],
    ],
    seedsCount: 2,
    drawSize: 8,
  },
  {
    qualifyingPositions: 2,
    seededDrawPositions: [
      [1, 1],
      [2, 9],
    ],
    seedsCount: 2,
    drawSize: 16,
  },
  {
    qualifyingPositions: 4,
    seededDrawPositions: [
      [1, 1],
      [2, 5],
    ],
    seedsCount: 2,
    drawSize: 16,
  },
  {
    qualifyingPositions: 8,
    seededDrawPositions: [
      [1, 1],
      [2, 3],
    ],
    seedsCount: 2,
    drawSize: 16,
  },
  {
    qualifyingPositions: 16,
    seedingProfile: { positioning: CLUSTER, nonRandom: true },
    // prettier-ignore
    seededDrawPositions: [
      [ 1, 1 ],    [ 2, 9 ],    [ 3, 17 ],
      [ 4, 25 ],   [ 5, 33 ],   [ 6, 41 ],
      [ 7, 49 ],   [ 8, 57 ],   [ 9, 65 ],
      [ 10, 73 ],  [ 11, 81 ],  [ 12, 89 ],
      [ 13, 97 ],  [ 14, 105 ], [ 15, 113 ],
      [ 16, 121 ], [ 17, 128 ], [ 18, 120 ],
      [ 19, 112 ], [ 20, 104 ], [ 21, 96 ],
      [ 22, 88 ],  [ 23, 80 ],  [ 24, 72 ],
      [ 25, 64 ],  [ 26, 56 ],  [ 27, 48 ],
      [ 28, 40 ],  [ 29, 32 ],  [ 30, 24 ],
      [ 31, 16 ],  [ 32, 8 ]
    ],
    seedsCount: 32,
    drawSize: 128,
  },
  {
    qualifyingPositions: 8,
    seedingProfile: { positioning: CLUSTER, nonRandom: true },
    // prettier-ignore
    seededDrawPositions: [
      [ 1, 1 ],    [ 2, 17 ],   [ 3, 33 ],
      [ 4, 49 ],   [ 5, 65 ],   [ 6, 81 ],
      [ 7, 97 ],   [ 8, 113 ],  [ 9, 128 ],
      [ 10, 112 ], [ 11, 96 ],  [ 12, 80 ],
      [ 13, 64 ],  [ 14, 48 ],  [ 15, 32 ],
      [ 16, 16 ],  [ 17, 8 ],   [ 18, 24 ],
      [ 19, 40 ],  [ 20, 56 ],  [ 21, 72 ],
      [ 22, 88 ],  [ 23, 104 ], [ 24, 120 ],
      [ 25, 121 ], [ 26, 105 ], [ 27, 89 ],
      [ 28, 73 ],  [ 29, 57 ],  [ 30, 41 ],
      [ 31, 25 ],  [ 32, 9 ]
    ],
    seedsCount: 32,
    drawSize: 128,
  },
];

it.each(scenarios.slice(8))('can generate and seed a qualifying structure', (scenario) => {
  const ratingType = ELO;
  const participantsCount = 144;
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'QTest' }],
    participantsProfile: {
      scaledParticipantsCount: participantsCount,
      category: { ratingType },
      participantsCount,
    },
  });

  tournamentEngine.setState(tournamentRecord);

  const event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(0);

  const participants = tournamentEngine.getParticipants().participants;
  expect(participants.length).toEqual(participantsCount);

  const scaledParticipants = participants.filter(({ timeItems }) => timeItems);
  expect(scaledParticipants.length).toEqual(participantsCount);

  const scaleAttributes = {
    eventType: SINGLES,
    scaleType: RATING,
    scaleName: ELO,
  };
  let result = tournamentEngine.participantScaleItem({
    participant: scaledParticipants[0],
    scaleAttributes,
  });
  expect(result.scaleItem.scaleName).toEqual(ratingType);

  const participantIds = participants.map(getParticipantId);
  const mainStageEntryIds = participantIds.slice(0, 12);
  const qualifyingStageEntryIds = participantIds.slice(12);

  const sortedQualifyingParticipantIds = qualifyingStageEntryIds.sort(
    (a, b) =>
      tournamentEngine.getParticipantScaleItem({
        scaleAttributes,
        participantId: a,
      }).scaleItem.scaleValue -
      tournamentEngine.getParticipantScaleItem({
        scaleAttributes,
        participantId: b,
      }).scaleItem.scaleValue,
  );

  result = tournamentEngine.addEventEntries({
    participantIds: mainStageEntryIds,
    eventId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.addEventEntries({
    participantIds: qualifyingStageEntryIds,
    entryStage: QUALIFYING,
    eventId,
  });
  expect(result.success).toEqual(true);

  const qualifyingSeedingScaleName = 'QS';
  const scaleValues = generateRange(1, scenario.seedsCount + 1);
  scaleValues.forEach((scaleValue, index) => {
    const scaleItem = {
      scaleName: qualifyingSeedingScaleName,
      scaleType: SEEDING,
      eventType: SINGLES,
      scaleValue,
    };
    const participantId = sortedQualifyingParticipantIds[index];
    const result = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem,
    });
    expect(result.success).toEqual(true);
  });

  result = tournamentEngine.generateDrawDefinition({
    seedingProfile: scenario.seedingProfile,
    qualifyingProfiles: [
      {
        structureProfiles: [
          {
            seedingScaleName: qualifyingSeedingScaleName,
            ...scenario,
          },
        ],
      },
    ],
    qualifyingOnly: true,
    eventId,
  });
  expect(result.success).toEqual(true);
  const drawDefinition = result.drawDefinition;
  expect(drawDefinition.structures.length).toEqual(2);
  expect(drawDefinition.structures[0].positionAssignments.filter(({ participantId }) => participantId).length).toEqual(
    scenario.drawSize,
  );

  expect(drawDefinition.structures[1].matchUps.length).toEqual(0);
  expect(drawDefinition.structures[0].seedAssignments.map(({ participantId }) => participantId).length).toEqual(
    scenario.seedsCount,
  );

  const participantIdDrawPositionMap = Object.assign(
    {},
    ...drawDefinition.structures[0].positionAssignments.map(({ participantId, drawPosition }) => ({
      [participantId]: drawPosition,
    })),
  );

  const seededDrawPositions = drawDefinition.structures[0].seedAssignments.map((assignment) => [
    assignment.seedNumber,
    participantIdDrawPositionMap[assignment.participantId],
  ]);
  if (scenario.seededDrawPositions) {
    expect(seededDrawPositions).toEqual(scenario.seededDrawPositions);
  } else {
    console.log({ seededDrawPositions });
  }
});
