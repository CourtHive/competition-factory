import { getParticipantId } from '@Functions/global/extractors';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { RATING, SEEDING } from '@Constants/scaleConstants';
import { COMPETITOR } from '@Constants/participantRoles';
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
];

it.each(scenarios)('can generate and seed a qualifying structure', (scenario) => {
  const ratingType = ELO;
  const participantsCount = 44;
  const {
    eventIds: [eventId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    eventProfiles: [{ eventName: 'QTest', category: { categoryName: 'U18' } }],
    participantsProfile: {
      scaledParticipantsCount: participantsCount,
      category: { ratingType },
      participantsCount,
    },
  });

  tournamentEngine.setState(tournamentRecord);

  let event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.entries.length).toEqual(0);

  let participants = tournamentEngine.getParticipants().participants;
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
  const scaleValues = [1, 2, 3, 4, 5, 6, 7, 8];
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

  const sortedMainParticipantIds = mainStageEntryIds.sort(
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

  const mainSeedingScaleName = 'MS';
  scaleValues.forEach((scaleValue, index) => {
    const scaleItem = {
      scaleName: mainSeedingScaleName,
      scaleType: SEEDING,
      eventType: SINGLES,
      scaleValue,
    };
    const participantId = sortedMainParticipantIds[index];
    const result = tournamentEngine.setParticipantScaleItem({
      participantId,
      scaleItem,
    });
    expect(result.success).toEqual(true);
  });

  // first get all participants that have SEEDING timeItems
  participants = tournamentEngine.getParticipants().participants;

  let seedScaledParticipants = participants.filter(({ timeItems }) =>
    timeItems?.find((timeItem) => timeItem.itemType.split('.')[1] === SEEDING),
  );

  let seedScaledParticipantIds = seedScaledParticipants.map(getParticipantId);
  expect(seedScaledParticipantIds.length).toEqual(16);

  // now attempt to get hydrated seeding information when { usePublishState: true }
  participants = tournamentEngine.getParticipants({
    participantFilters: { participantRoles: [COMPETITOR] },
    withSeeding: true,
    withDraws: true,
  }).participants;

  let targetParticipants = participants
    .filter(({ participantId }) => seedScaledParticipantIds.includes(participantId))
    .filter(({ events }) => events?.[0].seedAssignments);
  // no seeding has been published, so we expect no participants with hydrated seeding information
  expect(targetParticipants.length).toEqual(0);

  let p = tournamentEngine.getParticipants({
    withSeeding: true,
    withEvents: true,
  }).participants;

  let tP = p
    .filter(({ participantId }) => seedScaledParticipantIds.includes(participantId))
    .filter(({ events }) => events[0].seedAssignments);
  expect(tP.length).toEqual(0);

  // now attempt to get hydrated seeding information when { usePublishState: false }
  participants = tournamentEngine.getParticipants({
    participantFilters: { participantRoles: [COMPETITOR] },
    withEvents: true,
    withSeeding: {
      // NOTE: this currently only works for a single event...
      [QUALIFYING]: qualifyingSeedingScaleName,
      [MAIN]: mainSeedingScaleName,
    },
  }).participants;

  targetParticipants = participants
    .filter(({ participantId }) => seedScaledParticipantIds.includes(participantId))
    .filter(({ events }) => events?.[0].seedAssignments);
  expect(targetParticipants.length).toEqual(16);

  // test getParticipants parity
  p = tournamentEngine.getParticipants({
    withSeeding: {
      // NOTE: this currently only works for a single event...
      [QUALIFYING]: qualifyingSeedingScaleName,
      [MAIN]: mainSeedingScaleName,
    },
    withEvents: true,
  }).participants;

  tP = p
    .filter(({ participantId }) => seedScaledParticipantIds.includes(participantId))
    .filter(({ events }) => events[0].seedAssignments);
  expect(tP.length).toEqual(16);

  tournamentEngine.publishEventSeeding({
    stageSeedingScaleNames: {
      [QUALIFYING]: qualifyingSeedingScaleName,
      [MAIN]: mainSeedingScaleName,
    },
    eventId,
  });

  participants = tournamentEngine.devContext(true).getParticipants({
    participantFilters: { participantRoles: [COMPETITOR] },
    withSeeding: true,
    withEvents: true,
  }).participants;

  targetParticipants = participants
    .filter(({ participantId }) => seedScaledParticipantIds.includes(participantId))
    .filter(({ events }) => events?.[0].seedAssignments);
  expect(targetParticipants.length).toEqual(16);

  let seedAssignments = targetParticipants.map(({ events }) => events[0].seedAssignments);
  for (const seedAssignment of seedAssignments) {
    const assignment: any = Object.values(seedAssignment)[0];
    expect(assignment.seedValue).not.toBeUndefined();
  }
  expect(targetParticipants.length).toEqual(16);

  // test getParticipants parity
  p = tournamentEngine.getParticipants({
    usePublishState: true,
    withSeeding: true,
    withEvents: true,
  }).participants;

  tP = p
    .filter(({ participantId }) => seedScaledParticipantIds.includes(participantId))
    .filter(({ events }) => events[0].seedAssignments);
  seedAssignments = tP.map(({ events }) => events[0].seedAssignments);
  for (const seedAssignment of seedAssignments) {
    const assignment: any = Object.values(seedAssignment)[0];
    expect(assignment.seedValue).not.toBeUndefined();
  }
  // end parity check

  result = tournamentEngine.generateDrawDefinition({
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
  expect(seededDrawPositions).toEqual(scenario.seededDrawPositions);

  result = tournamentEngine.addDrawDefinition({ eventId, drawDefinition });
  expect(result.success).toEqual(true);

  participants = tournamentEngine.getParticipants({
    participantFilters: { participantRoles: [COMPETITOR] },
    withSeeding: true,
    withEvents: true,
  }).participants;

  targetParticipants = participants
    .filter(({ participantId }) => seedScaledParticipantIds.includes(participantId))
    .filter(({ events }) => events?.[0].seedAssignments);
  expect(targetParticipants.length).toEqual(16); // 8 in qualifying, 8 in main

  event = tournamentEngine.getEvent({ eventId }).event;
  expect(event.drawDefinitions.length).toEqual(1);

  const drawId = drawDefinition.drawId;
  result = tournamentEngine.generateDrawDefinition({
    seedingScaleName: mainSeedingScaleName,
    seedsCount: 4,
    drawSize: 16,
    drawId,
  });
  expect(result.existingDrawDefinition).toEqual(true);
  expect(result.success).toEqual(true);

  for (const structure of result.drawDefinition.structures) {
    const seededParticipantIds = structure.seedAssignments.filter(({ participantId }) => participantId);
    expect(seededParticipantIds.length).toEqual(4);
  }

  result = tournamentEngine.addDrawDefinition({
    drawDefinition: result.drawDefinition,
    allowReplacement: true,
    eventId,
  });
  expect(result.success).toEqual(true);

  tournamentEngine.publishEventSeeding({
    // seedingScaleNames: [qualifyingSeedingScaleName, mainSeedingScaleName],
    stageSeedingScaleNames: {
      [QUALIFYING]: qualifyingSeedingScaleName,
      [MAIN]: mainSeedingScaleName,
    },
    eventId,
  });

  participants = tournamentEngine.getParticipants({
    participantFilters: { participantRoles: [COMPETITOR] },
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  }).participants;

  seedScaledParticipants = participants.filter(({ timeItems }) =>
    timeItems?.find((timeItem) => timeItem.itemType.split('.')[1] === SEEDING),
  );

  // 8 in qualifying, 8 in main
  // this is the # of participants with a timeItem specifying their seed number
  // this is NOT the # of participants who have been assigned a seed position
  seedScaledParticipantIds = seedScaledParticipants.map(getParticipantId);
  expect(seedScaledParticipantIds.length).toEqual(16);

  targetParticipants = participants
    .filter(({ participantId }) => seedScaledParticipantIds.includes(participantId))
    .filter(({ events }) => events?.[0].seedAssignments?.QUALIFYING);
  expect(targetParticipants.length).toEqual(8);

  seedAssignments = targetParticipants.map(({ events }) => events[0].seedAssignments);
  for (const seedAssignment of seedAssignments) {
    const assignment: any = Object.values(seedAssignment)[0];
    expect(assignment.seedValue).not.toBeUndefined();
  }
  const drawSeedAssignments = targetParticipants
    .filter(({ draws }) => draws[0].seedAssignments?.QUALIFYING)
    .map(({ draws }) => draws[0].seedAssignments);
  for (const seedAssignment of drawSeedAssignments) {
    const assignment: any = Object.values(seedAssignment)[0];
    expect(assignment.seedValue).not.toBeUndefined();
  }

  // unpublish only qualifying stage seeding
  result = tournamentEngine.unPublishEventSeeding({
    stages: [QUALIFYING],
    eventId,
  });
  expect(result.success).toEqual(true);

  participants = tournamentEngine.getParticipants({
    participantFilters: { participantRoles: [COMPETITOR] },
    withSeeding: true,
    withEvents: true,
  }).participants;

  targetParticipants = participants
    .filter(({ participantId }) => seedScaledParticipantIds.includes(participantId))
    .filter(({ events }) => events?.[0].seedAssignments?.QUALIFYING);

  expect(targetParticipants.length).toEqual(4);
});
