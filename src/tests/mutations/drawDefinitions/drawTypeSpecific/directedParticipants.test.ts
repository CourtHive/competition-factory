import { assignDrawPositionBye } from '@Mutate/matchUps/drawPositions/assignDrawPositionBye';
import { assignDrawPosition } from '@Mutate/matchUps/drawPositions/positionAssignment';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { generateFMLC } from '../primitives/firstMatchLoserConsolation';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { verifyStructure } from '../primitives/verifyStructure';
import { parseScoreString } from '@Tools/parseScoreString';
import { getDrawStructures } from '@Acquire/findStructure';
import mocksEngine from '@Assemblies/engines/mock';
import { expect, it } from 'vitest';
import {
  completeMatchUp,
  verifyMatchUps,
  getMatchUpWinnerLoserIds,
  findMatchUpByRoundNumberAndPosition,
} from '../primitives/verifyMatchUps';

// Constants and types
import { BYE, RETIRED, COMPLETED, TO_BE_PLAYED, DEFAULTED, SUSPENDED } from '@Constants/matchUpStatusConstants';
import { setMatchUpState } from '@Mutate/matchUps/matchUpStatus/setMatchUpState';
import { DIRECT_ACCEPTANCE, WILDCARD } from '@Constants/entryStatusConstants';
import { EntryStatusUnion, StageTypeUnion } from '@Types/tournamentTypes';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  CANNOT_CHANGE_WINNING_SIDE,
  INCOMPATIBLE_MATCHUP_STATUS,
  INVALID_VALUES,
} from '@Constants/errorConditionConstants';

it('advances paired drawPositions when BYE is assigned first', () => {
  let result;

  const stage: StageTypeUnion = MAIN;
  const drawSize = 8;

  const { drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      participantsCount: drawSize - 2,
      automated: false,
      drawSize,
    },
  });

  const {
    structures: [structure],
  } = getDrawStructures({ drawDefinition, stage });

  const entryStatuses: EntryStatusUnion[] = [DIRECT_ACCEPTANCE, WILDCARD];
  const mainDrawEntries = getStageEntries({
    drawDefinition,
    entryStatuses,
    stage,
  });
  const participantIds = mainDrawEntries.map((e) => e.participantId);

  const { structureId } = structure;
  const { unassignedPositions } = structureAssignedDrawPositions({
    drawDefinition,
    structureId,
  });

  result = assignDrawPositionBye({
    drawPosition: unassignedPositions?.[1].drawPosition,
    drawDefinition,
    structureId,
  });
  expect(result.success).toEqual(true);

  let { matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 1,
    roundNumber: 2,
    drawDefinition,
    structureId,
  });
  expect(matchUp.drawPositions).toMatchObject([1, undefined]);
  assignDrawPosition({
    drawPosition: unassignedPositions?.[0].drawPosition,
    participantId: participantIds[0],
    drawDefinition,
    structureId,
  });
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 1,
    roundNumber: 2,
    drawDefinition,
    structureId,
  }));
  expect(matchUp.drawPositions).toMatchObject([1, undefined]);

  verifyStructure({
    expectedPositionsAssignedCount: 2,
    expectedByeAssignments: 1,
    drawDefinition,
    structureId,
  });

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    expectedRoundPending: [3, 2],
    drawDefinition,
    structureId,
  });

  assignDrawPositionBye({
    drawPosition: unassignedPositions?.[6].drawPosition,
    drawDefinition,
    structureId,
  });
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 2,
    roundNumber: 2,
    drawDefinition,
    structureId,
  }));
  expect(matchUp.drawPositions).toMatchObject([8, undefined]);
  assignDrawPosition({
    drawPosition: unassignedPositions?.[7].drawPosition,
    participantId: participantIds[1],
    drawDefinition,
    structureId,
  });
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 2,
    roundNumber: 2,
    drawDefinition,
    structureId,
  }));
  expect(matchUp.drawPositions).toMatchObject([8, undefined]);

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 1,
    roundNumber: 1,
    drawDefinition,
    structureId,
  }));
  let { matchUpId } = matchUp;
  let { error } = setMatchUpState({
    matchUpStatus: RETIRED,
    drawDefinition,
    matchUpId,
  });
  expect(error).not.toBeUndefined();

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 1,
    roundNumber: 1,
    drawDefinition,
    structureId,
  }));
  let { matchUpStatus } = matchUp;
  expect(matchUpStatus).toEqual(BYE);

  ({ error } = setMatchUpState({
    // @ts-expect-error invalid matchUpStatus
    matchUpStatus: 'BOGUS',
    drawDefinition,
    matchUpId,
  }));
  expect(error).not.toBeUndefined();

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 2,
    roundNumber: 1,
    drawDefinition,
    structureId,
  }));
  ({ matchUpId } = matchUp);
  ({ error } = setMatchUpState({
    matchUpStatus: BYE,
    drawDefinition,
    matchUpId,
  }));
  expect(error).not.toBeUndefined();

  assignDrawPosition({
    drawPosition: unassignedPositions?.[2].drawPosition,
    participantId: participantIds[2],
    drawDefinition,
    structureId,
  });
  assignDrawPosition({
    drawPosition: unassignedPositions?.[3].drawPosition,
    participantId: participantIds[3],
    drawDefinition,
    structureId,
  });
  assignDrawPosition({
    drawPosition: unassignedPositions?.[4].drawPosition,
    participantId: participantIds[4],
    drawDefinition,
    structureId,
  });
  assignDrawPosition({
    drawPosition: unassignedPositions?.[5].drawPosition,
    participantId: participantIds[5],
    drawDefinition,
    structureId,
  });

  // add score
  let score, winningSide;
  ({ matchUpId } = completeMatchUp({
    scoreString: '6-3 6-3',
    roundPosition: 2,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
    structureId,
  }));
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 2,
    roundNumber: 1,
    drawDefinition,
    structureId,
  }));
  ({ matchUpStatus, winningSide, score } = matchUp);
  expect(matchUpStatus).toEqual(COMPLETED);
  expect(winningSide).toEqual(1);
  const sets = parseScoreString({ scoreString: '6-3 6-3' });
  expect(score?.sets).toEqual(sets);

  // check that winning player was advanced
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 1,
    roundNumber: 2,
    drawDefinition,
    structureId,
  }));
  const { drawPositions } = matchUp;
  expect(drawPositions).toMatchObject([1, 3]);

  setMatchUpState({
    matchUpStatus: RETIRED,
    drawDefinition,
    matchUpId,
  });
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 2,
    roundNumber: 1,
    drawDefinition,
    structureId,
  }));
  ({ matchUpStatus, score } = matchUp);
  expect(matchUpStatus).toEqual(RETIRED);
  expect(score?.sets).toEqual(sets);

  // change winning side; score must be included when changing winning side
  result = setMatchUpState({
    matchUpStatus: DEFAULTED,
    winningSide: 2,
    drawDefinition,
    matchUpId,
  });
  expect(result.success).toEqual(true);

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 2,
    roundNumber: 1,
    drawDefinition,
    structureId,
  }));
  ({ matchUpStatus, winningSide } = matchUp);
  expect(matchUpStatus).toEqual(DEFAULTED);
  expect(winningSide).toEqual(2);

  result = setMatchUpState({
    matchUpStatus: TO_BE_PLAYED,
    drawDefinition,
    matchUpId,
  });
  expect(result).toMatchObject(SUCCESS);

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 2,
    roundNumber: 1,
    drawDefinition,
    structureId,
  }));
  ({ matchUpStatus, winningSide } = matchUp);
  expect(matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(winningSide).toEqual(undefined);
});

it('advances paired drawPosition if BYE is assigned second', () => {
  const stage = MAIN;
  const drawSize = 8;

  const { drawDefinition } = mocksEngine.generateEventWithDraw({
    drawProfile: {
      participantsCount: drawSize - 2,
      automated: false,
      drawSize,
    },
  });

  const {
    structures: [structure],
  } = getDrawStructures({ drawDefinition, stage });

  const entryStatuses: EntryStatusUnion[] = [DIRECT_ACCEPTANCE, WILDCARD];
  const mainDrawEntries = getStageEntries({
    drawDefinition,
    entryStatuses,
    stage,
  });
  const participantIds = mainDrawEntries.map((e) => e.participantId);
  const [participantId1, participantId2] = participantIds;

  const { structureId } = structure;
  const { unassignedPositions } = structureAssignedDrawPositions({
    drawDefinition,
    structureId,
  });

  assignDrawPosition({
    drawPosition: unassignedPositions?.[0].drawPosition,
    participantId: participantId1,
    drawDefinition,
    structureId,
  });
  let { matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 1,
    roundNumber: 2,
    drawDefinition,
    structureId,
  });
  expect(matchUp.drawPositions.filter(Boolean)).toMatchObject([]);
  assignDrawPositionBye({
    drawPosition: unassignedPositions?.[1].drawPosition,
    drawDefinition,
    structureId,
  });
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 1,
    roundNumber: 2,
    drawDefinition,
    structureId,
  }));
  expect(matchUp.drawPositions).toMatchObject([1, undefined]);

  verifyStructure({
    expectedPositionsAssignedCount: 2,
    expectedByeAssignments: 1,
    drawDefinition,
    structureId,
  });

  verifyMatchUps({
    expectedRoundCompleted: [0, 0],
    expectedRoundUpcoming: [0, 0],
    expectedRoundPending: [3, 2],
    drawDefinition,
    structureId,
  });

  assignDrawPosition({
    drawPosition: unassignedPositions?.[7].drawPosition,
    participantId: participantId2,
    drawDefinition,
    structureId,
  });
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 2,
    roundNumber: 2,
    drawDefinition,
    structureId,
  }));
  expect(matchUp.drawPositions.filter(Boolean)).toMatchObject([]);

  assignDrawPositionBye({
    drawPosition: unassignedPositions?.[6].drawPosition,
    drawDefinition,
    structureId,
  });
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    roundPosition: 2,
    roundNumber: 2,
    drawDefinition,
    structureId,
  }));
  expect(matchUp.drawPositions).toMatchObject([8, undefined]);
});

it('can change a FMLC first round matchUp winner and update consolation', () => {
  const participantsCount = 30;
  const seedsCount = 8;
  const drawSize = 32;

  const genResult = generateFMLC({
    participantsCount,
    seedsCount,
    drawSize,
  });
  const { mainStructureId, consolationStructureId } = genResult;
  const { drawDefinition } = genResult;

  let result, error, success;
  let matchUp, matchUpId, matchUpStatus, sides, score;

  // complete the 2nd position matchUp, between drawPositions: [3, 4]; 3 advances;
  ({ success, matchUpId } = completeMatchUp({
    structureId: mainStructureId,
    scoreString: '6-1 6-2',
    roundPosition: 2,
    winningSide: 1,
    roundNumber: 1,
    drawDefinition,
  }));
  expect(success).toEqual(true);

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    structureId: mainStructureId,
    roundPosition: 2,
    inContext: true,
    roundNumber: 1,
    drawDefinition,
  }));
  ({ matchUpStatus, score } = matchUp);
  expect(matchUpStatus).toEqual(COMPLETED);
  expect(matchUp.drawPositions).toEqual([3, 4]);
  const sets = parseScoreString({ scoreString: '6-1 6-2' });
  expect(score?.sets).toEqual(sets);

  const { winningParticipantId, losingParticipantId } = getMatchUpWinnerLoserIds({
    drawDefinition,
    matchUpId,
  });

  // check that winner advanced to second round matchUp and that matchUpStatus is TO_BE_PLAYED
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    structureId: mainStructureId,
    roundPosition: 1,
    inContext: true,
    roundNumber: 2,
    drawDefinition,
  }));
  ({ matchUpStatus, sides } = matchUp);
  expect(matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(matchUp.drawPositions).toMatchObject([1, 3]);
  expect(sides[1].participantId).toEqual(winningParticipantId);

  // check that first matchUp in consolation draw is BYE and that loser was directed
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    structureId: consolationStructureId,
    roundPosition: 1,
    inContext: true,
    roundNumber: 1,
    drawDefinition,
  }));
  ({ sides } = matchUp);
  expect(sides[1].participantId).toEqual(losingParticipantId);

  // check that second matchUp in consolation draw is TO_BE_PLAYED
  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    structureId: consolationStructureId,
    roundPosition: 2,
    roundNumber: 1,
    drawDefinition,
  }));
  ({ matchUpStatus } = matchUp);
  expect(matchUpStatus).toEqual(TO_BE_PLAYED);

  // advance main draw participant in drawPosition: 1 to third round
  ({ success } = completeMatchUp({
    structureId: mainStructureId,
    scoreString: '6-2 6-1',
    roundPosition: 1,
    roundNumber: 2,
    winningSide: 1,
    drawDefinition,
  }));
  expect(success).toEqual(true);

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    structureId: mainStructureId,
    roundPosition: 1,
    roundNumber: 2,
    drawDefinition,
  }));
  expect(matchUp.drawPositions).toEqual([1, 3]);

  // attempt to complete 2nd position matchUp in first round of consolation draw
  result = completeMatchUp({
    structureId: consolationStructureId,
    scoreString: '6-1 1-6 6-2',
    roundPosition: 2,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
  });
  ({ error, success } = result);
  expect(success).toEqual(undefined);
  // error because matchUp drawPositions are not assigned to participantIds
  expect(error).not.toBeUndefined();

  // complete matchUp between drawPositions: [5, 6] in mainStructure
  // ...to direct other participants to consolation draw
  ({ success } = completeMatchUp({
    structureId: mainStructureId,
    scoreString: '6-1 6-3',
    roundPosition: 3,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
  }));
  expect(success).toEqual(true);

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    structureId: mainStructureId,
    roundPosition: 3,
    roundNumber: 1,
    drawDefinition,
  }));
  expect(matchUp.drawPositions).toEqual([5, 6]);

  ({ success } = completeMatchUp({
    structureId: mainStructureId,
    scoreString: '6-1 6-4',
    roundPosition: 4,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
  }));
  expect(success).toEqual(true);

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    structureId: mainStructureId,
    roundPosition: 4,
    roundNumber: 1,
    drawDefinition,
  }));
  expect(matchUp.drawPositions).toEqual([7, 8]);

  // complete 2nd position matchUp in first round of consolation draw
  ({ success } = completeMatchUp({
    structureId: consolationStructureId,
    scoreString: '6-1 1-6 6-2',
    roundPosition: 2,
    roundNumber: 1,
    winningSide: 1,
    drawDefinition,
  }));
  expect(success).toEqual(true);

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    structureId: consolationStructureId,
    roundPosition: 2,
    roundNumber: 1,
    drawDefinition,
  }));
  expect(matchUp.drawPositions).toEqual([11, 12]);

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    structureId: consolationStructureId,
    roundPosition: 1,
    inContext: true,
    roundNumber: 3,
    drawDefinition,
  }));
  ({ sides } = matchUp);
  // { drawPosition: 10 } is bye- advanced to the third round
  expect(sides[0].drawPosition).toEqual(10);

  // Now attempt to change a 1st round matchUpStatus to BYE
  ({
    matchUp: { matchUpId },
  } = findMatchUpByRoundNumberAndPosition({
    structureId: mainStructureId,
    roundPosition: 2,
    inContext: true,
    roundNumber: 1,
    drawDefinition,
  }));
  ({ error } = setMatchUpState({
    matchUpStatus: BYE,
    drawDefinition,
    score: '6-1',
    matchUpId,
  }));
  expect(error).not.toBeUndefined();

  // Now attempt to change a 1st round matchUpStatus to TO_BE_PLAYED
  ({
    matchUp: { matchUpId },
  } = findMatchUpByRoundNumberAndPosition({
    structureId: mainStructureId,
    roundPosition: 2,
    inContext: true,
    roundNumber: 1,
    drawDefinition,
  }));

  ({ error } = setMatchUpState({
    matchUpStatus: TO_BE_PLAYED,
    drawDefinition,
    matchUpId,
  }));
  expect(error).not.toBeUndefined();

  // Now attempt to change a 1st round matchUpStatus, but not winner...
  result = setMatchUpState({
    matchUpStatus: RETIRED,
    drawDefinition,
    score: '6-1',
    matchUpId,
  });
  expect(result.error).toEqual(INVALID_VALUES);
  result = setMatchUpState({
    matchUpStatus: RETIRED,
    drawDefinition,
    matchUpId,
  });
  expect(result.success).toEqual(true);

  // Now attempt to change a 1st round matchUpStatus to nonDirecting outcome, same winningSide...
  result = setMatchUpState({
    matchUpStatus: SUSPENDED,
    winningSide: 1,
    drawDefinition,
    matchUpId,
  });
  expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);

  // Now attempt to change a 1st round matchUp outcome, including winner...
  // when { allowChangePropagation: false } which is the default behavior
  ({ error } = setMatchUpState({
    matchUpStatus: COMPLETED,
    winningSide: 2,
    drawDefinition,
    matchUpId,
  }));
  expect(error).toEqual(CANNOT_CHANGE_WINNING_SIDE);

  ({ matchUp } = findMatchUpByRoundNumberAndPosition({
    structureId: mainStructureId,
    roundPosition: 2,
    inContext: true,
    roundNumber: 1,
    drawDefinition,
  }));
  ({ matchUpStatus } = matchUp);
  expect(matchUpStatus).toEqual(RETIRED);
  expect(matchUp.winningSide).toEqual(1);
});
