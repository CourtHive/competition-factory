import { getOrderedDrawPositionPairs } from '@Tests/mutations/drawDefinitions/testingUtilities';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { getDrawPosition } from '@Functions/global/extractors';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { BYE, DEFAULTED, DOUBLE_DEFAULT } from '@Constants/matchUpStatusConstants';
import { POLICY_TYPE_PROGRESSION } from '@Constants/policyConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

const getTarget = ({ matchUps, roundNumber, roundPosition }) =>
  matchUps.find((matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);

test('A DOUBLE_DEFAULT will create a DEFAULT and winningSide changes will propagate past WD/WD', () => {
  const drawProfiles = [{ drawSize: 16 }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  let matchUpsNotificationCounter = 0;
  let result = setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (matchUps) => {
        matchUpsNotificationCounter += matchUps?.length || 0;
      },
    },
  });
  expect(result.success).toEqual(true);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();

  // Enter DOUBLE_DEFAULT in R1P1
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(matchUpsNotificationCounter).toEqual(2);
  expect(result.success).toEqual(true);

  // Enter Score in R1P2 advancing DP3
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(matchUpsNotificationCounter).toEqual(5);

  // Expect R2P1 to have only DP3 with winningSide: 2
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3]);
  expect(targetMatchUp.winningSide).toEqual(2);

  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-3 6-3',
    winningSide: 2,
  }));

  // Change R1P2 winningSide (allowChangePropagation: true)
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    allowChangePropagation: true,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(matchUpsNotificationCounter).toEqual(8);

  // expect that the winning side has been updated to 2 and is now DP4
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([4]);
  expect(targetMatchUp.winningSide).toEqual(2);
});

/*
  R1P1 matchUp is BYE.  Enters three DOUBLE_DEFAULTs in remaining first round matchUps, from top down.
  Entering "Double Exit" in R1P2 produces DEFAULTED in R2P1 and advances DP1 to 3rd round. 
  Entering "Double Exit" in R1P3 produces DEFAULTED in R2P2. 
  Entering "Double Exit" in R1P4 converts R2P2 to DOUBLE_DEFAULT and produces DEFAULTED in R3P1. 
*/
test('DOUBLE DOUBLE_DEFAULTs will convert a produced DEFAULT into a DOUBLE_DEFAULT', () => {
  const drawProfiles = [{ drawSize: 8, participantsCount: 7 }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  let modifiedMatchUpLog: any[] = [];
  let result = setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (matchUps) => {
        matchUps.forEach(({ matchUp }) => modifiedMatchUpLog.push([matchUp.roundNumber, matchUp.roundPosition]));
      },
    },
  });
  expect(result.success).toEqual(true);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  // Enter DOUBLE_DEFAULT in R1P2
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 2],
    [2, 1],
    [3, 1],
  ]);
  modifiedMatchUpLog = [];

  // Check that R2P1 is a produced DEFAULTED
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DEFAULTED);

  // Enter DOUBLE_DEFAULT in R1P3
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 3 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 3],
    [2, 2],
  ]);
  modifiedMatchUpLog = [];

  // Produces DEFAULTED in R2P2
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(DEFAULTED);

  // Enter DOUBLE_DEFAULT in R1P4
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 4 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 4],
    [2, 2],
    [3, 1],
  ]);

  // Converts DEFAULTED to DOUBLE_DEFAULT in R2P2
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_DEFAULT);

  // Produces DEFAULTED in R3P1, advances DP1 to Final, sets winningSide
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  expect(targetMatchUp.matchUpStatus).toEqual(DEFAULTED);
  expect(targetMatchUp.winningSide).toEqual(1);
});

/*
  R1P1 matchUp is BYE.  Enters three DOUBLE_DEFAULTs in remaining first round matchUps, from bottom up.
  Entering "Double Exit" in R1P4 produces DEFAULTED in R2P2.
  Entering "Double Exit" in R1P3 converts R2P2 to DOUBLE_DEFAULT and produces DEFAULTED in R3P1. 
  Entering "Double Exit" in R1P2 produces DEFAULTED in R2P1 and advances DP1 to 3rd round and to FINAL. 
*/
test('DOUBLE DOUBLE_DEFAULTs will convert a produced DEFAULTED into a DOUBLE_DEFAULT', () => {
  const drawProfiles = [{ drawSize: 8, participantsCount: 7 }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });
  tournamentEngine.setState(tournamentRecord);

  let modifiedMatchUpLog: any[] = [];
  let result = setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (matchUps) => {
        matchUps.forEach(({ matchUp }) => modifiedMatchUpLog.push([matchUp.roundNumber, matchUp.roundPosition]));
      },
    },
  });
  expect(result.success).toEqual(true);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(BYE);

  // Enter DOUBLE_DEFAULT in R1P4
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 4 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 4],
    [2, 2],
  ]);
  modifiedMatchUpLog = [];

  // Check that R2P4 is a produced DEFAULTED
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(DEFAULTED);

  // Enter DOUBLE_DEFAULT in R1P3
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 3 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 3],
    [2, 2],
    [3, 1],
  ]);
  modifiedMatchUpLog = [];

  // Produces DEFAULTED in R2P2 which is immediately converted into DOUBLE_DEFAULT
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_DEFAULT);
  // Produces DEFAULTED in R3P1
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DEFAULTED);

  // Enter DOUBLE_DEFAULT in R1P2
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 2],
    [2, 1],
    [3, 1],
  ]);

  // R2P1 remains a DEFAULTED because it has a winningSide
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DEFAULTED);
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  expect(targetMatchUp.winningSide).toEqual(1);

  // Produces DEFAULTED in R3P1, advances DP1 to Final, sets winningSide
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  expect(targetMatchUp.matchUpStatus).toEqual(DEFAULTED);
  expect(targetMatchUp.winningSide).toEqual(1);
});

it('supports entering/removing DOUBLE_DEFAULT matchUpStatus with doubleExitPropagateBye', () => {
  // create an FMLC with the 1st position matchUp completed
  const drawProfiles = [
    {
      policyDefinitions: {
        [POLICY_TYPE_PROGRESSION]: {
          doubleExitPropagateBye: true,
        },
      },
      drawSize: 8,
      drawType: FIRST_MATCH_LOSER_CONSOLATION,
      outcomes: [
        {
          scoreString: '6-1 6-2',
          roundPosition: 1,
          roundNumber: 1,
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  // get the first upcoming matchUp, which will be { roundPosition: 2 }
  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const [matchUp] = upcomingMatchUps;
  const { matchUpId, roundPosition } = matchUp;
  expect(roundPosition).toEqual(2);

  let {
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId });

  const mainStructureOrderedPairs = [[1, 2], [3, 4], [5, 6], [7, 8], [1]];
  const consolationStructureOrderedPairs = [[3, 4], [5, 6], [1], [2]];

  let { filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  });
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual(mainStructureOrderedPairs);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual(consolationStructureOrderedPairs);

  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { matchUp: updatedMatchUp } = tournamentEngine.findMatchUp({
    matchUpId,
    drawId,
  });
  expect(updatedMatchUp.matchUpStatus).toEqual(DOUBLE_DEFAULT);

  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));

  const { positionAssignments } = getPositionAssignments({
    structure: consolationStructure,
  });
  const consolationByeDrawPositions = positionAssignments?.filter(({ bye }) => bye).map(getDrawPosition);
  expect(consolationByeDrawPositions).toEqual([1, 4]);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [1], [1]]);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));
  expect(filteredOrderedPairs).toEqual([[3, 4], [5, 6], [1, 3], [2], [3]]);

  // remove outcome
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    outcome: toBePlayed,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({
    drawDefinition: {
      structures: [mainStructure, consolationStructure],
    },
  } = tournamentEngine.getEvent({ drawId }));
  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: mainStructure.structureId,
  }));

  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual(mainStructureOrderedPairs);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({
    structureId: consolationStructure.structureId,
  }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual(consolationStructureOrderedPairs);
});

/*
Generate SINGLE_ELIMINATION drawSize: 16 and complete r1p1 with score
*/
it('handles DOUBLE_DEFAULT for drawSize: 16', () => {
  const drawProfiles = [
    {
      drawSize: 16,
      outcomes: [
        {
          scoreString: '6-1 6-1',
          roundPosition: 1,
          roundNumber: 1,
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  tournamentEngine.setState(tournamentRecord);

  // get the first upcoming matchUp
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const { matchUpId } = getTarget({
    roundPosition: 2,
    roundNumber: 1,
    matchUps,
  });

  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.getEvent({ drawId });

  let { filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId });
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
    [1],
  ]);

  const result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
    matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId }));

  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
    [1],
    [1],
  ]);
});

it('advanceds a DOUBLE_DEFAULT when encountering DOUBLE DOUBLE_DEFAULT', () => {
  const drawProfiles = [
    {
      drawSize: 16,
      outcomes: [
        {
          scoreString: '6-1 6-1',
          roundPosition: 1,
          roundNumber: 1,
          winningSide: 1,
        },
        {
          scoreString: '6-1 6-1',
          roundPosition: 2,
          roundNumber: 1,
          winningSide: 1,
        },
        {
          matchUpStatus: DOUBLE_DEFAULT,
          roundPosition: 3,
          roundNumber: 1,
        },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });

  const preWalkover = [
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
    [1, 3],
  ];

  let { filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId });
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual(preWalkover);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const targetMatchUp = matchUps.find(({ roundNumber, roundPosition }) => roundNumber === 1 && roundPosition === 4);
  const result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome: { matchUpStatus: DOUBLE_DEFAULT },
  });
  expect(result.success).toEqual(true);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual(preWalkover);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());

  const roundMatchUps: any = getRoundMatchUps({ matchUps })?.roundMatchUps;
  expect(roundMatchUps[1].map(({ matchUpStatus }) => matchUpStatus)).toEqual([
    'COMPLETED',
    'COMPLETED',
    'DOUBLE_DEFAULT',
    'DOUBLE_DEFAULT',
    'TO_BE_PLAYED',
    'TO_BE_PLAYED',
    'TO_BE_PLAYED',
    'TO_BE_PLAYED',
  ]);
  expect(roundMatchUps[2].map(({ matchUpStatus }) => matchUpStatus)).toEqual([
    'TO_BE_PLAYED',
    'DOUBLE_DEFAULT',
    'TO_BE_PLAYED',
    'TO_BE_PLAYED',
  ]);
});

it('handles DOUBLE DOUBLE_DEFAULT advancement', () => {
  const drawProfiles = [
    {
      drawSize: 16,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          scoreString: '6-1 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          matchUpStatus: DOUBLE_DEFAULT,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          matchUpStatus: DOUBLE_DEFAULT,
        },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });

  let { filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId });
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
    [1, 3],
  ]);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const targetMatchUp = matchUps.find(({ roundNumber, roundPosition }) => roundNumber === 2 && roundPosition === 1);
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });
  const result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
    [1, 3],
    [1],
    [1],
  ]);
});

it('handles advances when encountring consecutive DOUBLE_WALKOVERs', () => {
  const drawProfiles = [
    {
      drawSize: 16,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          scoreString: '6-1 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-1',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          matchUpStatus: DOUBLE_DEFAULT,
        },
        {
          roundNumber: 2,
          roundPosition: 1,
          matchUpStatus: DOUBLE_DEFAULT,
        },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const {
    drawDefinition: {
      structures: [{ structureId }],
    },
  } = tournamentEngine.setState(tournamentRecord).getEvent({ drawId });

  let { filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId });
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
    [1, 3],
  ]);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const targetMatchUp = matchUps.find(({ roundNumber, roundPosition }) => roundNumber === 1 && roundPosition === 4);
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });
  const result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual([
    [1, 2],
    [3, 4],
    [5, 6],
    [7, 8],
    [9, 10],
    [11, 12],
    [13, 14],
    [15, 16],
    [1, 3],
    [7],
    [7],
    [7],
  ]);
});
