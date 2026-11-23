import { completeMatchUp, verifyMatchUps } from '@Tests/mutations/drawDefinitions/primitives/verifyMatchUps';
import { generateFMLC } from '@Tests/mutations/drawDefinitions/primitives/firstMatchLoserConsolation';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getDrawStructures } from '@Acquire/findStructure';
import { instanceCount } from '@Tools/arrays';
import { expect, it } from 'vitest';

// constants
import { MAIN, CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

// Fixtures
import SEEDING_USTA from '@Fixtures/policies/POLICY_SEEDING_DEFAULT';
import SEEDING_ITF from '@Fixtures/policies/POLICY_SEEDING_ITF';

it('can direct winners and losers with ITF SEEDING POLICY; all participants with BYEs win first matchUp', () => {
  const participantsCount = 24;
  const seedsCount = 8;
  const drawSize = 32;

  const { drawDefinition, mainStructureId, consolationStructureId } = generateFMLC({
    policyDefinitions: SEEDING_ITF,
    participantsCount,
    seedsCount,
    drawSize,
  });

  const {
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 });
  const { structureId: verifyMainStructureId } = mainStructure;

  const {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  const { structureId: verifyConsolationStructureId } = consolationStructure;

  expect(mainStructureId).toEqual(verifyMainStructureId);
  expect(consolationStructureId).toEqual(verifyConsolationStructureId);

  let { roundMatchUps } = getRoundMatchUps(consolationStructure);
  const matchUpStatuses = instanceCount(roundMatchUps?.[1].map(({ matchUpStatus }) => matchUpStatus));
  // all first round consolation matchUps are BYEs
  expect(matchUpStatuses.BYE).toEqual(8);

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [8, 0],
    structureId: mainStructureId,
    expectedRoundPending: [0, 8],
    drawDefinition,
  });

  let completionValues = [
    [1, 1, 2, undefined], // can't complete BYE
    [1, 2, 2, true],
    [1, 3, 1, true],
    [1, 4, 1, undefined], // can't complete BYE
    [1, 5, 2, undefined], // can't complete BYE
    [1, 6, 1, true],
    [1, 7, 1, true],
    [1, 8, 2, undefined], // can't complete BYE
    [1, 9, 1, undefined], // can't complete BYE
    [1, 10, 1, true],
    [1, 11, 1, true],
    [1, 12, 2, undefined], // can't complete BYE
    [1, 13, 1, undefined], // can't complete BYE
    [1, 14, 1, true],
    [1, 15, 1, true],
    [1, 16, 2, undefined], // can't complete BYE
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

  verifyMatchUps({
    expectedRoundPending: [0, 0, 4, 2, 1],
    expectedRoundCompleted: [8, 0],
    expectedRoundUpcoming: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundPending: [0, 8, 4, 2, 1],
    structureId: consolationStructureId,
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    requireParticipants: true, // requires that drawPositions be assigned to participantIds
    drawDefinition,
  });

  completionValues = [
    [2, 1, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 2, 2, true], // side 2 had 1st round BYE, wins matchUp
    [2, 3, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 4, 2, true], // side 2 had 1st round BYE, wins matchUp
    [2, 5, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 6, 2, true], // side 2 had 1st round BYE, wins matchUp
    [2, 7, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 8, 2, true], // side 2 had 1st round BYE, wins matchUp
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
    if (result.success) {
      const { matchUps } = getAllDrawMatchUps({
        inContext: true,
        drawDefinition,
      });
      const matchUp = matchUps?.find(
        (matchUp) =>
          matchUp.structureId === mainStructureId &&
          matchUp.roundNumber === roundNumber &&
          matchUp.roundPosition === roundPosition,
      );
      expect(matchUp?.winningSide).toEqual(winningSide);
    }
  });

  const positionAssignmentByesCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.bye,
  ).length;
  const positionAssignmentParticipantidsCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.participantId,
  ).length;

  expect(positionAssignmentByesCount).toEqual(16);
  expect(positionAssignmentParticipantidsCount).toEqual(8);

  ({ roundMatchUps } = getRoundMatchUps(consolationStructure));
  roundMatchUps?.[1].forEach((matchUp) => {
    expect(matchUp.matchUpStatus).toEqual(BYE);
  });
});

it('can direct winners and losers with ITF SEEDING POLICY; all participants with BYEs lose first matchUp', () => {
  const drawSize = 32;
  const seedsCount = 8;
  const participantsCount = 24;

  const { drawDefinition, mainStructureId, consolationStructureId } = generateFMLC({
    policyDefinitions: SEEDING_ITF,
    participantsCount,
    seedsCount,
    drawSize,
  });

  const {
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 });
  const { structureId: verifyMainStructureId } = mainStructure;

  const {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  const { structureId: verifyConsolationStructureId } = consolationStructure;

  expect(mainStructureId).toEqual(verifyMainStructureId);
  expect(consolationStructureId).toEqual(verifyConsolationStructureId);

  let { roundMatchUps } = getRoundMatchUps(consolationStructure);
  const matchUpStatuses = instanceCount(roundMatchUps?.[1].map(({ matchUpStatus }) => matchUpStatus));
  // all first round consolation matchUps are BYEs
  expect(matchUpStatuses.BYE).toEqual(8);

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [8, 0],
    expectedRoundPending: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  let completionValues = [
    [1, 1, 2, undefined], // can't complete BYE
    [1, 2, 2, true],
    [1, 3, 1, true],
    [1, 4, 1, undefined], // can't complete BYE
    [1, 5, 2, undefined], // can't complete BYE
    [1, 6, 1, true],
    [1, 7, 1, true],
    [1, 8, 2, undefined], // can't complete BYE
    [1, 9, 1, undefined], // can't complete BYE
    [1, 10, 1, true],
    [1, 11, 1, true],
    [1, 12, 2, undefined], // can't complete BYE
    [1, 13, 1, undefined], // can't complete BYE
    [1, 14, 1, true],
    [1, 15, 1, true],
    [1, 16, 2, undefined], // can't complete BYE
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

  verifyMatchUps({
    expectedRoundPending: [0, 0, 4, 2, 1],
    expectedRoundCompleted: [8, 0],
    expectedRoundUpcoming: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundPending: [0, 8, 4, 2, 1],
    structureId: consolationStructureId,
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    requireParticipants: true, // requires that drawPositions be assigned to participantIds
    drawDefinition,
  });

  completionValues = [
    [2, 1, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 2, 1, true], // side 2 had 1st round BYE, loses matchUp
    [2, 3, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 4, 1, true], // side 2 had 1st round BYE, loses matchUp
    [2, 5, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 6, 1, true], // side 2 had 1st round BYE, loses matchUp
    [2, 7, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 8, 1, true], // side 2 had 1st round BYE, loses matchUp
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
    if (result.success) {
      const { matchUps } = getAllDrawMatchUps({
        drawDefinition,
        inContext: true,
      });
      const matchUp = matchUps?.find(
        (matchUp) =>
          matchUp.structureId === mainStructureId &&
          matchUp.roundNumber === roundNumber &&
          matchUp.roundPosition === roundPosition,
      );
      expect(matchUp?.winningSide).toEqual(winningSide);
    }
  });

  const positionAssignmentByesCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.bye,
  ).length;
  const positionAssignmentParticipantidsCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.participantId,
  ).length;
  expect(positionAssignmentByesCount).toEqual(8);
  expect(positionAssignmentParticipantidsCount).toEqual(16);

  ({ roundMatchUps } = getRoundMatchUps(consolationStructure));
  roundMatchUps?.[1].forEach((matchUp) => {
    expect(matchUp.matchUpStatus).toEqual(BYE);
  });
});

it('can direct winners and losers with USTA SEEDING POLICY; all participants with BYEs win first matchUp', () => {
  const drawSize = 32;
  const seedsCount = 8;
  const participantsCount = 24;

  const { drawDefinition, mainStructureId, consolationStructureId } = generateFMLC({
    policyDefinitions: SEEDING_USTA,
    participantsCount,
    seedsCount,
    drawSize,
  });

  const {
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 });
  const { structureId: verifyMainStructureId } = mainStructure;

  const {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  const { structureId: verifyConsolationStructureId } = consolationStructure;

  expect(mainStructureId).toEqual(verifyMainStructureId);
  expect(consolationStructureId).toEqual(verifyConsolationStructureId);

  let { roundMatchUps } = getRoundMatchUps(consolationStructure);
  roundMatchUps?.[1].forEach((matchUp) => {
    expect(matchUp.matchUpStatus).toEqual(BYE);
  });

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [8, 0],
    expectedRoundPending: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  let completionValues = [
    [1, 1, 2, undefined], // can't complete BYE
    [1, 2, 2, true],
    [1, 3, 1, undefined], // can't complete BYE
    [1, 4, 1, true],
    [1, 5, 2, undefined], // can't complete BYE
    [1, 6, 1, true],
    [1, 7, 1, undefined], // can't complete BYE
    [1, 8, 2, true],
    [1, 9, 1, true],
    [1, 10, 1, undefined], // can't complete BYE
    [1, 11, 1, true],
    [1, 12, 2, undefined], // can't complete BYE
    [1, 13, 1, true],
    [1, 14, 1, undefined], // can't complete BYE
    [1, 15, 1, true],
    [1, 16, 2, undefined], // can't complete BYE
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

  verifyMatchUps({
    expectedRoundPending: [0, 0, 4, 2, 1],
    expectedRoundCompleted: [8, 0],
    expectedRoundUpcoming: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundPending: [0, 8, 4, 2, 1],
    structureId: consolationStructureId,
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    requireParticipants: true, // requires that drawPositions be assigned to participantIds
    drawDefinition,
  });

  completionValues = [
    [2, 1, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 2, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 3, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 4, 1, true], // side 1 had 1st round BYE, wins matchUp
    [2, 5, 2, true], // side 2 had 1st round BYE, wins matchUp
    [2, 6, 2, true], // side 2 had 1st round BYE, wins matchUp
    [2, 7, 2, true], // side 2 had 1st round BYE, wins matchUp
    [2, 8, 2, true], // side 2 had 1st round BYE, wins matchUp
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

  const positionAssignmentByesCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.bye,
  ).length;
  const positionAssignmentParticipantidsCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.participantId,
  ).length;
  expect(positionAssignmentByesCount).toEqual(16);
  expect(positionAssignmentParticipantidsCount).toEqual(8);

  // wne participants who advanced in the first-round of the main structure with a BYE win their second-round main structure matchUps,
  // matchUps in the first round of the consolation structure should have matchUpStatus: BYE
  ({ roundMatchUps } = getRoundMatchUps(consolationStructure));
  roundMatchUps?.[1].forEach((matchUp) => {
    expect(matchUp.matchUpStatus).toEqual(BYE);
  });
});

it('can direct winners and losers with USTA SEEDING POLICY; all participants with BYEs lose first matchUp', () => {
  const drawSize = 32;
  const seedsCount = 8;
  const participantsCount = 24;

  const { drawDefinition, mainStructureId, consolationStructureId } = generateFMLC({
    policyDefinitions: SEEDING_USTA,
    participantsCount,
    seedsCount,
    drawSize,
  });

  const {
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 });
  const { structureId: verifyMainStructureId } = mainStructure;

  const {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  const { structureId: verifyConsolationStructureId } = consolationStructure;

  expect(mainStructureId).toEqual(verifyMainStructureId);
  expect(consolationStructureId).toEqual(verifyConsolationStructureId);

  let { roundMatchUps } = getRoundMatchUps(consolationStructure);
  roundMatchUps?.[1].forEach((matchUp) => {
    expect(matchUp.matchUpStatus).toEqual(BYE);
  });

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [8, 0],
    expectedRoundPending: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  let completionValues = [
    [1, 1, 2, undefined], // can't complete BYE
    [1, 2, 2, true],
    [1, 3, 1, undefined], // can't complete BYE
    [1, 4, 1, true],
    [1, 5, 2, undefined], // can't complete BYE
    [1, 6, 1, true],
    [1, 7, 1, undefined], // can't complete BYE
    [1, 8, 2, true],
    [1, 9, 1, true],
    [1, 10, 1, undefined], // can't complete BYE
    [1, 11, 1, true],
    [1, 12, 2, undefined], // can't complete BYE
    [1, 13, 1, true],
    [1, 14, 1, undefined], // can't complete BYE
    [1, 15, 1, true],
    [1, 16, 2, undefined], // can't complete BYE
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

  verifyMatchUps({
    expectedRoundPending: [0, 0, 4, 2, 1],
    expectedRoundCompleted: [8, 0],
    expectedRoundUpcoming: [0, 8],
    structureId: mainStructureId,
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundPending: [0, 8, 4, 2, 1],
    structureId: consolationStructureId,
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    requireParticipants: true, // requires that drawPositions be assigned to participantIds
    drawDefinition,
  });

  completionValues = [
    [2, 1, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 2, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 3, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 4, 2, true], // side 1 had 1st round BYE, loses matchUp
    [2, 5, 1, true], // side 2 had 1st round BYE, loses matchUp
    [2, 6, 1, true], // side 2 had 1st round BYE, loses matchUp
    [2, 7, 1, true], // side 2 had 1st round BYE, loses matchUp
    [2, 8, 1, true], // side 2 had 1st round BYE, loses matchUp
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

  const positionAssignmentByesCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.bye,
  ).length;
  const positionAssignmentParticipantidsCount = consolationStructure.positionAssignments?.filter(
    (assignment) => !!assignment.participantId,
  ).length;
  expect(positionAssignmentByesCount).toEqual(8);
  expect(positionAssignmentParticipantidsCount).toEqual(16);

  ({ roundMatchUps } = getRoundMatchUps(consolationStructure));
  roundMatchUps?.[1].forEach((matchUp) => {
    expect(matchUp.matchUpStatus).toEqual(BYE);
  });
});
