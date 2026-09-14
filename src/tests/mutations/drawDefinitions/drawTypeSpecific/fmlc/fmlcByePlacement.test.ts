import { generateFMLC } from '@Tests/mutations/drawDefinitions/primitives/firstMatchLoserConsolation';
import { completeMatchUp } from '@Tests/mutations/drawDefinitions/primitives/verifyMatchUps';
import { getDrawStructures } from '@Acquire/findStructure';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { instanceCount } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants and fixtures
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import SEEDING_USTA from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';

it('can support ITF Consolation BYE placement', () => {
  const participantsCount = 24;
  const seedsCount = 8;
  const drawSize = 32;

  const { drawDefinition, mainStructureId } = generateFMLC({
    policyDefinitions: SEEDING_ITF,
    participantsCount,
    seedsCount,
    drawSize,
  });

  const completionValues = [
    [1, 2, 2, true],
    [1, 3, 1, true],
    [2, 1, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 2, 2, true], // side 2 had 1st round BYE, wins matchUp
  ];

  completionValues.forEach((values) => {
    const [roundNumber, roundPosition, winningSide, success] = values;
    const result = completeMatchUp({
      structureId: mainStructureId,
      drawDefinition,
      roundPosition,
      winningSide,
      roundNumber,
    });
    expect(result.success).toEqual(success);
  });

  const {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  const positionAssignmentByesCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.bye,
  ).length;
  const positionAssignmentParticipantidsCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.participantId,
  ).length;
  expect(positionAssignmentByesCount).toEqual(10);
  expect(positionAssignmentParticipantidsCount).toEqual(2);
});

it('can support USTA Consolation BYE placement', () => {
  const participantsCount = 24;
  const seedsCount = 8;
  const drawSize = 32;

  const { drawDefinition, mainStructureId } = generateFMLC({
    policyDefinitions: SEEDING_USTA,
    participantsCount,
    seedsCount,
    drawSize,
  });

  const completionValues = [
    [1, 2, 2, true],
    [1, 4, 1, true],
    [2, 1, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 2, 1, true], // side 1 had 1st round BYE, wins matchUp
  ];

  completionValues.forEach((values) => {
    const [roundNumber, roundPosition, winningSide, success] = values;
    const result = completeMatchUp({
      structureId: mainStructureId,
      drawDefinition,
      roundPosition,
      winningSide,
      roundNumber,
    });
    expect(result.success).toEqual(success);
  });

  const {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });

  const positionAssignmentByesCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.bye,
  ).length;
  const positionAssignmentParticipantidsCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.participantId,
  ).length;
  expect(positionAssignmentByesCount).toEqual(10);
  expect(positionAssignmentParticipantidsCount).toEqual(2);
});

it('can remove BYEs when matchUps are cleared', () => {
  const participantsCount = 24;
  const seedsCount = 8;
  const drawSize = 32;

  const { drawDefinition, mainStructureId } = generateFMLC({
    policyDefinitions: SEEDING_USTA,
    participantsCount,
    seedsCount,
    drawSize,
  });

  let completionValues: any[] = [
    [1, 2, 2, true],
    [1, 4, 1, true],
    [2, 1, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 2, 1, true], // side 1 had 1st round BYE, wins matchUp
  ];

  checkAssignments({
    structureId: mainStructureId,
    participantsCount: 2,
    completionValues,
    byesCount: 10,
    drawDefinition,
  });

  completionValues = [[2, 1, undefined, true]];

  checkAssignments({
    structureId: mainStructureId,
    participantsCount: 2,
    completionValues,
    drawDefinition,
    byesCount: 9,
  });

  completionValues = [[2, 2, undefined, true]];

  checkAssignments({
    completionValues,
    structureId: mainStructureId,
    participantsCount: 2,
    drawDefinition,
    byesCount: 8,
  });

  completionValues = [
    [2, 1, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 2, 2, true], // side 1 had 1st round BYE, loses matchUp
  ];

  checkAssignments({
    completionValues,
    structureId: mainStructureId,
    participantsCount: 4,
    drawDefinition,
    byesCount: 8,
  });

  completionValues = [
    [2, 1, undefined, true],
    [2, 2, undefined, true],
  ];

  checkAssignments({
    completionValues,
    structureId: mainStructureId,
    participantsCount: 2,
    drawDefinition,
    byesCount: 8,
  });

  completionValues = [
    [2, 1, 1, true],
    [2, 2, 1, true],
  ];

  checkAssignments({
    completionValues,
    structureId: mainStructureId,
    participantsCount: 2,
    byesCount: 10,
    drawDefinition,
  });
});

it('can remove BYEs when matchUps are cleared', () => {
  const drawProfiles = [
    {
      drawSize: 32,
      participantsCount: 17,
      seedsCount: 8,
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);
  const { upcomingMatchUps } = tournamentEngine.drawMatchUps({
    constextFilters: { stages: [MAIN] },
    inContext: true,
    drawId,
  });
  expect(upcomingMatchUps.length).toEqual(8);
  const secondRoundUpcoming = upcomingMatchUps.filter(({ roundNumber }) => roundNumber === 2);
  expect(secondRoundUpcoming.length).toEqual(7);

  let { byeMatchUps } = tournamentEngine.drawMatchUps({
    contextFilters: { stages: [CONSOLATION] },
    inContext: true,
    drawId,
  });
  expect(byeMatchUps.length).toEqual(15);
  expect(instanceCount(byeMatchUps.map((m) => m.matchUpStatus)).BYE).toEqual(15);

  let {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId });
  let mainByePositionAssignments = mainStructure.positionAssignments.filter(({ bye }) => bye);
  expect(mainByePositionAssignments.length).toEqual(15);
  let consolationByePositionAssignments = consolationStructure.positionAssignments.filter(({ bye }) => bye);
  expect(consolationByePositionAssignments.length).toEqual(15);

  secondRoundUpcoming.forEach(({ matchUpId }) => {
    let result = tournamentEngine.setMatchUpStatus({
      outcome: { winningSide: 1 },
      matchUpId,
      drawId,
    });
    expect(result.success).toEqual(true);
    result = tournamentEngine.setMatchUpStatus({
      matchUpId,
      outcome: { winningSide: 2 },
      drawId,
    });
    expect(result.success).toEqual(true);
  });

  ({ byeMatchUps } = tournamentEngine.drawMatchUps({
    drawId,
    inContext: true,
    contextFilters: { stages: [CONSOLATION] },
  }));
  expect(byeMatchUps.length).toEqual(15);
  expect(instanceCount(byeMatchUps.map((m) => m.matchUpStatus)).BYE).toEqual(15);

  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));
  mainByePositionAssignments = mainStructure.positionAssignments.filter(({ bye }) => bye);
  expect(mainByePositionAssignments.length).toEqual(15);
  consolationByePositionAssignments = consolationStructure.positionAssignments.filter(({ bye }) => bye);
  expect(consolationByePositionAssignments.length).toEqual(15);
});

function checkAssignments({ completionValues, participantsCount, drawDefinition, structureId, byesCount }) {
  completionValues?.forEach((values) => {
    const [roundNumber, roundPosition, winningSide, success] = values;
    const result = completeMatchUp({
      roundPosition,
      drawDefinition,
      roundNumber,
      winningSide,
      structureId,
    });
    expect(result.success).toEqual(success);
  });

  const {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  const positionAssignmentByesCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.bye,
  ).length;
  const positionAssignmentParticipantidsCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.participantId,
  ).length;
  expect(positionAssignmentByesCount).toEqual(byesCount);
  expect(positionAssignmentParticipantidsCount).toEqual(participantsCount);
}
