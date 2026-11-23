import { completeMatchUp, verifyMatchUps } from '@Tests/mutations/drawDefinitions/primitives/verifyMatchUps';
import { generateFMLC } from '@Tests/mutations/drawDefinitions/primitives/firstMatchLoserConsolation';
import { verifyStructure } from '@Tests/mutations/drawDefinitions/primitives/verifyStructure';
import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { publicFindDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { getDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getDrawStructures } from '@Acquire/findStructure';
import { expect, it } from 'vitest';

// constants
import { BYE, RETIRED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { MAIN, CONSOLATION } from '@Constants/drawDefinitionConstants';
import { POLICY_TYPE_FEED_IN } from '@Constants/policyConstants';

it('can generate FIRST_MATCH_LOSER_CONSOLATION', () => {
  const participantsCount = 30;
  const seedsCount = 8;
  const drawSize = 32;

  const genResult = generateFMLC({
    participantsCount,
    seedsCount,
    drawSize,
  });
  const { drawDefinition, mainStructureId, consolationStructureId } = genResult;

  verifyStructure({
    expectedPositionsAssignedCount: 32,
    expectedSeedValuesWithBye: [1, 2],
    structureId: mainStructureId,
    expectedByeAssignments: 2,
    expectedSeedsWithByes: 2,
    expectedSeeds: 8,
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundUpcoming: [14, 0],
    expectedRoundCompleted: [0, 0],
    structureId: mainStructureId,
    expectedRoundPending: [0, 8],
    drawDefinition,
  });

  // no BYEs have yet been assigned because participants with first round BYEs may lose in second round
  // and progress to consolation structure due to first matchUp loss
  verifyStructure({
    structureId: consolationStructureId,
    expectedPositionsAssignedCount: 2,
    expectedSeedValuesWithBye: [],
    expectedByeAssignments: 2,
    expectedSeedsWithByes: 0,
    expectedSeeds: 0,
    drawDefinition,
  });

  verifyMatchUps({
    structureId: consolationStructureId,
    expectedRoundPending: [0, 6, 4, 2, 1],
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [6, 2],
    requireParticipants: false,
    drawDefinition,
  });

  verifyMatchUps({
    structureId: consolationStructureId,
    expectedRoundPending: [6, 8, 4, 2, 1],
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    requireParticipants: true, // requires that drawPositions be assigned to participantIds
    drawDefinition,
  });
});

it('can direct winners and losers', () => {
  const participantsCount = 30;
  const seedsCount = 8;
  const drawSize = 32;

  let result;

  const genResult = generateFMLC({
    participantsCount,
    seedsCount,
    drawSize,
  });
  const { drawDefinition, mainStructureId, consolationStructureId } = genResult;

  result = completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 2,
    winningSide: 2,
    roundNumber: 1,
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  result = completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 3,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  result = completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 4,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  verifyMatchUps({
    structureId: mainStructureId,
    expectedRoundUpcoming: [11, 2],
    expectedRoundCompleted: [3, 0],
    expectedRoundPending: [0, 6],
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundPending: [5, 7, 4, 2, 1],
    structureId: consolationStructureId,
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [1, 0],
    requireParticipants: true, // requires that drawPositions be assigned to participantIds
    drawDefinition,
  });

  // now the participant in drawPosition: 1 will lose to the winner of 3-4 and be fed into consolation
  // this tests first matchUp loss in the second round for participant who received a first round BYE
  // the participant in drawPosition: 1 should go into the consolation structure
  completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 1,
    roundNumber: 2,
    winningSide: 2,
    drawDefinition,
  });

  let {
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 });
  const { structureId: verifyMainStructureId } = mainStructure;

  let {
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  });
  const { structureId: verifyConsolationStructureId } = consolationStructure;

  expect(mainStructureId).toEqual(verifyMainStructureId);
  expect(consolationStructureId).toEqual(verifyConsolationStructureId);

  // find second round matchUp for first seeded player with BYE
  let sourceMatchUp = mainStructure?.matchUps?.find(
    (matchUp) => matchUp.roundNumber === 2 && matchUp.roundPosition === 1,
  );

  let sourceDrawPositionParticipantId = mainStructure.positionAssignments?.find(
    (assignment) => assignment.drawPosition === 1,
  )?.participantId;
  expect(sourceMatchUp?.drawPositions?.includes(1)).toEqual(true);

  let targetDrawPositionParticipantId = consolationStructure?.positionAssignments?.find(
    (assignment) => assignment.drawPosition === 1,
  )?.participantId;

  let targetMatchUp = consolationStructure?.matchUps?.find(
    (matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1,
  );
  expect(targetMatchUp?.drawPositions).toEqual([9, 10]);
  expect(targetMatchUp?.matchUpStatus).toEqual(BYE);

  expect(sourceDrawPositionParticipantId).toEqual(targetDrawPositionParticipantId);
  expect(consolationStructure?.positionAssignments?.[0].bye).toEqual(undefined);

  completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 13,
    roundNumber: 1,
    winningSide: 2,
    drawDefinition,
  });
  completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 14,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
  });
  completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 15,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundCompleted: [6, 1],
    expectedRoundUpcoming: [8, 3],
    structureId: mainStructureId,
    expectedRoundPending: [0, 4],
    drawDefinition,
  });

  verifyMatchUps({
    expectedRoundPending: [4, 5, 4, 2, 1],
    structureId: consolationStructureId,
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [2, 1],
    drawDefinition,
  });

  // now advance drawPosition 32 in main structure which had a BYE in first round
  // the loser from drawPositions 29-30 should NOT go into the consolation structure
  const { success } = completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 8,
    roundNumber: 2,
    winningSide: 2,
    drawDefinition,
  });
  expect(success).toEqual(true);

  ({
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage: MAIN, stageSequence: 1 }));

  ({
    structures: [consolationStructure],
  } = getDrawStructures({
    drawDefinition,
    stage: CONSOLATION,
    stageSequence: 1,
  }));

  sourceMatchUp = mainStructure?.matchUps?.find((matchUp) => matchUp.roundNumber === 2 && matchUp.roundPosition === 8);

  sourceDrawPositionParticipantId = mainStructure?.positionAssignments?.find(
    (assignment) => assignment.drawPosition === 32,
  )?.participantId;
  expect(sourceMatchUp?.drawPositions?.includes(32)).toEqual(true);

  targetMatchUp = consolationStructure.matchUps?.find(
    (matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 8,
  );

  targetDrawPositionParticipantId = consolationStructure.positionAssignments?.find(
    (assignment) => assignment.drawPosition === 16,
  )?.participantId;

  expect(targetMatchUp?.drawPositions).toEqual([23, 24]);
  expect(targetMatchUp?.matchUpStatus).toEqual(BYE);

  expect(sourceDrawPositionParticipantId).not.toEqual(targetDrawPositionParticipantId);
  // fed position should be a bye
  expect(consolationStructure.positionAssignments?.[8].bye).toEqual(true);

  const { completedMatchUps } = getDrawMatchUps({
    requireParticipants: false,
    drawDefinition,
  });
  const completedMatchUpsCount = completedMatchUps?.length;
  expect(completedMatchUpsCount).toEqual(8);

  const [matchUp] = completedMatchUps ?? [];
  const { matchUpId } = matchUp;
  result = setMatchUpState({
    // @ts-expect-error invalid matchUpStatus
    matchUpStatus: 'BOGUS',
    drawDefinition,
    matchUpId,
  });
  let hasErrors = Boolean(result?.error);
  expect(hasErrors).toEqual(true);

  result = setMatchUpState({
    matchUpStatus: BYE,
    drawDefinition,
    matchUpId,
  });
  hasErrors = Boolean(result?.error);
  expect(hasErrors).toEqual(true);

  result = setMatchUpState({
    matchUpStatus: RETIRED,
    drawDefinition,
    matchUpId,
  });
  hasErrors = Boolean(result?.error);
  expect(hasErrors).toEqual(false);

  const { matchUp: fetchedMatchUp } = publicFindDrawMatchUp({
    drawDefinition,
    matchUpId,
  });
  const { matchUpStatus } = fetchedMatchUp;
  expect(matchUpStatus).toEqual(RETIRED);
});

it('can direct winners and losers drawSize: 4 with NO BYEs', () => {
  const participantsCount = 4;
  const seedsCount = 0;
  const drawSize = 4;

  let result;

  const policyDefinitions = { [POLICY_TYPE_FEED_IN]: { feedFromMainFinal: true } };
  const genResult = generateFMLC({
    participantsCount,
    policyDefinitions,
    seedsCount,
    drawSize,
  });

  const { drawDefinition, mainStructureId, consolationStructureId } = genResult;

  result = completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 1,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  result = completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 2,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
  });
  expect(result.success).toEqual(true);

  verifyMatchUps({
    expectedRoundCompleted: [2, 0],
    expectedRoundUpcoming: [0, 1],
    structureId: mainStructureId,
    expectedRoundPending: [0, 0],
    drawDefinition,
  });

  // now the participant in drawPosition: 1 will lose to the winner of 3-4 and be fed into consolation
  // this tests first matchUp loss in the second round for participant who received a first round BYE
  // the participant in drawPosition: 1 should go into the consolation structure
  completeMatchUp({
    structureId: mainStructureId,
    roundPosition: 1,
    roundNumber: 2,
    winningSide: 2,
    drawDefinition,
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

  expect(consolationStructureId).toEqual(verifyConsolationStructureId);
  expect(mainStructureId).toEqual(verifyMainStructureId);

  // find second round matchUp for first seeded player with BYE
  const sourceMatchUp = mainStructure.matchUps?.find(
    (matchUp) => matchUp.roundNumber === 2 && matchUp.roundPosition === 1,
  );

  const sourceDrawPositionParticipantId = mainStructure.positionAssignments?.find(
    (assignment) => assignment.drawPosition === 1,
  )?.participantId;
  expect(sourceMatchUp?.drawPositions?.includes(1)).toEqual(true);

  const targetDrawPositionParticipantId = consolationStructure.positionAssignments?.find(
    (assignment) => assignment.drawPosition === 2,
  )?.participantId;

  const targetMatchUp = consolationStructure.matchUps?.find(
    (matchUp) => matchUp.roundNumber === 1 && matchUp.roundPosition === 1,
  );
  expect(targetMatchUp?.drawPositions).toEqual([2, 3]);
  expect(targetMatchUp?.matchUpStatus).toEqual(TO_BE_PLAYED);

  expect(sourceDrawPositionParticipantId).not.toEqual(targetDrawPositionParticipantId);
  expect(consolationStructure.positionAssignments?.[0].bye).toEqual(true);
});
