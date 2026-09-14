import { getOrderedDrawPositionPairs } from '@Tests/mutations/drawDefinitions/testingUtilities';
import { getRoundMatchUps } from '@Query/matchUps/getRoundMatchUps';
import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it, test } from 'vitest';

// constants
import { BYE, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

const getTarget = ({ matchUps, roundNumber, roundPosition }) =>
  matchUps.find((matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);

test('A DOUBLE_WALKOVER will create a WALKOVER and winningSide changes will propagate past WOWO', () => {
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

  // Enter DOUBLE_WALKOVER in R1P1
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
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
  R1P1 matchUp is BYE.  Enters three DOUBLE_WALKOVERs in remaining first round matchUps, from top down.
  Entering WOWO in R1P2 produces WALKOVER in R2P1 and advances DP1 to 3rd round. 
  Entering WOWO in R1P3 produces WALKOVER in R2P2. 
  Entering WOWO in R1P4 converts R2P2 to DOUBLE_WALKOVER and produces WALKOVER in R3P1. 
*/
test('DOUBLE DOUBLE_WALKOVERs will convert a produced WALKOVER into a DOUBLE_WALKOVER', () => {
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

  // Enter DOUBLE_WALKOVER in R1P2
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 2],
    [2, 1],
    [3, 1],
  ]);
  modifiedMatchUpLog = [];

  // Check that R2P1 is a produced WALKOVER
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);

  // Enter DOUBLE_WALKOVER in R1P3
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 3 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 3],
    [2, 2],
  ]);
  modifiedMatchUpLog = [];

  // Produces WALKOVER in R2P2
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);

  // Enter DOUBLE_WALKOVER in R1P4
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 4 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 4],
    [2, 2],
    [3, 1],
  ]);

  // Converts WALKOVER to DOUBLE_WALKOVER in R2P2
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  // Produces WALKOVER in R3P1, advances DP1 to Final, sets winningSide
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(1);
});

/*
  R1P1 matchUp is BYE.  Enters three DOUBLE_WALKOVERs in remaining first round matchUps, from bottom up.
  Entering WOWO in R1P4 produces WaLKOVER in R2P2.
  Entering WOWO in R1P3 converts R2P2 to DOUBLE_WALKOVER and produces WALKOVER in R3P1. 
  Entering WOWO in R1P2 produces WALKOVER in R2P1 and advances DP1 to 3rd round and to FINAL. 
*/
test('DOUBLE DOUBLE_WALKOVERs will convert a produced WALKOVER into a DOUBLE_WALKOVER', () => {
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

  // Enter DOUBLE_WALKOVER in R1P2
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 4 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 4],
    [2, 2],
  ]);
  modifiedMatchUpLog = [];

  // Check that R2P2 is a produced WALKOVER
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);

  // Enter DOUBLE_WALKOVER in R1P3
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 3 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 3],
    [2, 2],
    [3, 1],
  ]);
  modifiedMatchUpLog = [];

  // Produces WALKOVER in R2P2 which is immediately converted into DOUBLE_WALKOVER
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  // Produces WALKOVER in R3P1
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);

  // Enter DOUBLE_WALKOVER in R1P2
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(modifiedMatchUpLog).toEqual([
    [1, 2],
    [2, 1],
    [3, 1],
  ]);

  // R2P1 remains a WALKOVER because it has a winningSide
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  expect(targetMatchUp.winningSide).toEqual(1);

  // Produces WALKOVER in R3P1, advances DP1 to Final, sets winningSide
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(1);
});

/*
Generate SINGLE_ELIMINATION drawSize: 16 and complete r1p1 with score
*/
it('handles DOUBLE_WALKOVER for drawSize: 16', () => {
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
    matchUps,
    roundNumber: 1,
    roundPosition: 2,
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
    drawId,
    matchUpId,
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
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

it('advanceds a DOUBLE_WALKOVER when encountering DOUBLE DOUBLE_WALKOVER', () => {
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
          matchUpStatus: DOUBLE_WALKOVER,
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
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
  });
  expect(result.success).toEqual(true);

  ({ filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId }));
  expect(filteredOrderedPairs.filter((p) => p?.length)).toEqual(preWalkover);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());

  const roundMatchUps: any = getRoundMatchUps({ matchUps })?.roundMatchUps;
  expect(roundMatchUps[1].map(({ matchUpStatus }) => matchUpStatus)).toEqual([
    'COMPLETED',
    'COMPLETED',
    'DOUBLE_WALKOVER',
    'DOUBLE_WALKOVER',
    'TO_BE_PLAYED',
    'TO_BE_PLAYED',
    'TO_BE_PLAYED',
    'TO_BE_PLAYED',
  ]);
  expect(roundMatchUps[2].map(({ matchUpStatus }) => matchUpStatus)).toEqual([
    'TO_BE_PLAYED',
    'DOUBLE_WALKOVER',
    'TO_BE_PLAYED',
    'TO_BE_PLAYED',
  ]);
});

it('handles DOUBLE DOUBLE_WALKOVER advancement', () => {
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
          matchUpStatus: DOUBLE_WALKOVER,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          matchUpStatus: DOUBLE_WALKOVER,
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
          matchUpStatus: DOUBLE_WALKOVER,
        },
        {
          roundNumber: 2,
          roundPosition: 1,
          matchUpStatus: DOUBLE_WALKOVER,
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
