import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { intersection } from '@Tools/arrays';
import { it, expect } from 'vitest';

// constants
import { MAIN, ROUND_ROBIN, WATERFALL } from '@Constants/drawDefinitionConstants';
import { SINGLES_EVENT } from '@Constants/eventConstants';

const scenarios = [
  {
    drawProfile: {
      seedingProfile: { positioning: WATERFALL },
      structureOptions: { groupSize: 4 },
      participantsCount: 6,
      seedsCount: 4,
      drawSize: 8,
    },
    expectation: {
      assignedPositionsCount: 8,
      roundMatchUpCounts: [4, 4, 4],
      seedsWithByes: [1, 2, 3, 4],
      byesCount: 2,
      groups: 2,
    },
  },
  {
    drawProfile: {
      seedingProfile: { positioning: WATERFALL },
      structureOptions: { groupSize: 5 },
      participantsCount: 9,
      seedsCount: 4,
      drawSize: 9,
    },
    expectation: {
      assignedPositionsCount: 10,
      roundMatchUpCounts: [4, 4, 4, 4, 4],
      seedsWithByes: [1, 2, 3, 4],
      byesCount: 1,
      groups: 2,
    },
  },
  {
    drawProfile: {
      seedingProfile: { positioning: WATERFALL },
      structureOptions: { groupSize: 7 },
      participantsCount: 40,
      seedsCount: 8,
      drawSize: 40,
    },
    expectation: {
      assignedPositionsCount: 42,
      seedsWithByes: [1, 2],
      roundMatchUpCounts: [18, 18, 18, 18, 18, 18, 18],
      byesCount: 2,
      groups: 6,
    },
  },
  {
    drawProfile: {
      seedingProfile: { positioning: WATERFALL },
      structureOptions: { groupSize: 5 },
      participantsCount: 37,
      seedsCount: 16,
      drawSize: 40,
    },
    expectation: {
      assignedPositionsCount: 40,
      roundMatchUpCounts: [16, 16, 16, 16, 16],
      seedsWithByes: [1, 2, 3],
      byesCount: 3,
      groups: 8,
    },
  },
  {
    drawProfile: {
      seedingProfile: { positioning: WATERFALL },
      structureOptions: { groupSize: 5 },
      participantsCount: 37,
      seedsCount: 37,
      drawSize: 40,
    },
    expectation: {
      assignedPositionsCount: 40,
      roundMatchUpCounts: [16, 16, 16, 16, 16],
      seedsWithByes: [1, 2, 3],
      byesCount: 3,
      groups: 8,
    },
  },
];

it.each(scenarios)('can generate and verify', (scenario) => {
  const { drawProfile, expectation } = scenario;
  const result = mocksEngine.generateTournamentRecord({
    drawProfiles: [{ ...drawProfile, enforcePolicyLimits: false, drawType: ROUND_ROBIN }],
  });

  const {
    tournamentRecord,
    eventIds: [eventId],
    drawIds: [drawId],
  } = result;

  const p = tournamentEngine.setState(tournamentRecord).getParticipants({
    withScaleValues: true,
    withSeeding: true,
    withEvents: true,
    withDraws: true,
  });
  const participantsWithSeedings = p.participants.filter((participant) => participant.seedings?.[SINGLES_EVENT]);
  expect(participantsWithSeedings.length).toEqual(scenario.drawProfile.seedsCount);

  for (const participant of participantsWithSeedings) {
    const { participantId } = participant;
    expect(participant.seedings[SINGLES_EVENT].length).toBeDefined();
    expect(p.participantMap[participantId].events[eventId].seedAssignments[MAIN].seedValue).toBeDefined();
    expect(p.participantMap[participantId].draws[drawId].seedAssignments[MAIN].seedValue).toBeDefined();
  }

  const structure = result.tournamentRecord.events[0].drawDefinitions[0].structures[0];
  const containedStructures = structure.structures;
  expect(containedStructures.length).toEqual(expectation.groups);

  const seedAssignments = structure.seedAssignments;
  const { positionAssignments } = getPositionAssignments({ structure });
  const assignedPositions = positionAssignments?.filter((assignment) => assignment.bye ?? assignment.participantId);
  expect(assignedPositions?.length).toEqual(expectation.assignedPositionsCount);
  const byePositions = positionAssignments
    ?.filter((assignment) => assignment.bye)
    .map(({ drawPosition }) => drawPosition);
  expect(byePositions?.length).toEqual(expectation.byesCount);

  const assignedSeedPositions = seedAssignments.filter((assignment) => assignment.participantId);
  expect(assignedSeedPositions.length).toEqual(drawProfile.seedsCount);

  const matchUps = getAllStructureMatchUps({ structure }).matchUps;
  const roundMatchUps = getRoundMatchUps({ matchUps }).roundMatchUps;
  const rmArr: any[] = roundMatchUps ? Object.values(roundMatchUps) : [];
  const roundMatchUpCounts = rmArr.map((value) => value.length);
  expect(roundMatchUpCounts).toEqual(expectation.roundMatchUpCounts);

  const groupedDrawPositions = structure.structures.map(({ positionAssignments }) =>
    positionAssignments.map(({ drawPosition }) => drawPosition),
  );
  const seedMapping = seedAssignments.map((seedAssignment) => {
    const position = assignedPositions?.find((assignment) => assignment.participantId === seedAssignment.participantId);
    return {
      drawPosition: position?.drawPosition,
      seedNumber: seedAssignment.seedNumber,
    };
  });

  const seededByes = seedMapping.map(({ drawPosition, seedNumber }) => {
    const groupedPositions = groupedDrawPositions.find((group) => group.includes(drawPosition));
    const groupByes = intersection(byePositions, groupedPositions).length;
    return [seedNumber, groupByes];
  });

  if (expectation.seedsWithByes) {
    const check = seededByes.filter((sb) => expectation.seedsWithByes.includes(sb[0]));
    expect(check.length).toEqual(expectation.seedsWithByes.length);
  }
});
