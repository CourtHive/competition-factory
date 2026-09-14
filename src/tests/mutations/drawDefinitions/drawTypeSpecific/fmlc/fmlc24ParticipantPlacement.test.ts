import { generateFMLC } from '@Tests/mutations/drawDefinitions/primitives/firstMatchLoserConsolation';
import { completeMatchUp } from '@Tests/mutations/drawDefinitions/primitives/verifyMatchUps';
import { expect, it } from 'vitest';

import SEEDING_USTA from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import { CONSOLATION } from '@Constants/drawDefinitionConstants';
import SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';
import { getDrawStructures } from '@Acquire/findStructure';

it('can support ITF Consolation participant placement', () => {
  const drawSize = 32;
  const seedsCount = 8;
  const participantsCount = 24;

  const { drawDefinition, mainStructureId } = generateFMLC({
    policyDefinitions: SEEDING_ITF,
    participantsCount,
    seedsCount,
    drawSize,
  });

  const completionValues = [
    [1, 2, 2, true],
    [1, 3, 1, true],
    [2, 1, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 2, 1, true], // side 2 had 1st round BYE, loses matchUp
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
  expect(positionAssignmentByesCount).toEqual(8);
  expect(positionAssignmentParticipantidsCount).toEqual(4);
});

it('can support USTA Consolation participant placement', () => {
  const drawSize = 32;
  const seedsCount = 8;
  const participantsCount = 24;

  const { drawDefinition, mainStructureId } = generateFMLC({
    policyDefinitions: SEEDING_USTA,
    participantsCount,
    seedsCount,
    drawSize,
  });

  const completionValues = [
    [1, 2, 2, true],
    [1, 4, 1, true],
    [2, 1, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 2, 2, true], // side 1 had 1st round BYE, loses matchUp
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
  expect(positionAssignmentByesCount).toEqual(8);
  expect(positionAssignmentParticipantidsCount).toEqual(4);
});
