import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants and fixtures
import { COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CONSOLATION, FEED_IN_CHAMPIONSHIP_TO_SF } from '@Constants/drawDefinitionConstants';
import { INCOMPATIBLE_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { REFEREE, SCORE } from '@Constants/matchUpActionConstants';
import { toBePlayed } from '@Fixtures/scoring/outcomes/toBePlayed';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

const getTarget = (params) => {
  const { matchUps, roundNumber, roundPosition, stage } = params;
  return matchUps.find(
    (matchUp) =>
      matchUp.roundNumber === roundNumber &&
      matchUp.roundPosition === roundPosition &&
      (!stage || matchUp.stage === stage),
  );
};

/*
  drawSize: 4
  R1P1 is entered as a DOUBLE_WALKOVER, which produces a WALKOVER in R2P1
  R1P2 score is entered progressing winner to R2P1; winner of R1P2 is also winner of R2P1 by WALKOVER
  R1P2 score is removed and winner of R2P1 should be removed
*/
test('drawSize: 4 - Removing a DOUBLE_WALKOVER will remove produced WALKOVER in subsequent round', () => {
  const drawProfiles = [{ drawSize: 4 }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  // keep track of notficiations with each setMatchUpStatus event
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

  // Target R1P1 and enter a DOUBLE_WALKOVER
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: DOUBLE_WALKOVER,
  });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 1],
    [2, 1],
  ]);
  modifiedMatchUpLog = [];

  // R2P1 should now be a produced WALKOVER
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  if (targetMatchUp.drawPositions) {
    expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([]);
  }
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toBeUndefined();

  // now target R1P2 and set outcome with score and winningSide
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-2',
    winningSide: 1,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 2],
    [2, 1],
  ]);
  modifiedMatchUpLog = [];

  // expect that winner of R1P2 is progressed to and is the winner of R2P1
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3]);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(2);

  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: undefined,
    matchUpStatus: TO_BE_PLAYED,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);
  tournamentEngine.devContext(false);
  expect(modifiedMatchUpLog).toEqual([
    [2, 1],
    [1, 1],
  ]);
  modifiedMatchUpLog = [];

  // DOUBLE_WALKOVER advanced winner is removed from R2P1
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });

  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3]);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toBeUndefined();
  expect(targetMatchUp.matchUpStatusCodes).toEqual(undefined);
});

/*
  drawSize: 8
  R1P1 is entered as a DOUBLE_WALKOVER, which produces a WALKOVER in R2P1
  R1P2 score is entered progressing winner to R2P1; winner of R1P2 is also winner of R2P1 by WALKOVER
  DP3 is winner of R1P2 and is progressed to R3P1 by winning R2P1; 
  R1P1 DOUBLE_WALKOVER is removed and winner of R2P1 should be removed and R3P1 should have no drawPositions

  R1P3 is entered as a DOUBLE_WALKOVER, which produces a WALKOVER in R2P2
  R1P4 score is entered progressing winner to R2P2; winner of R1P4 is also winner of R2P2 by WALKOVER
  DP7 is winner of R2P2 and is progressed to R3P1 by winning R2P2; 
  R1P4 score is removed and winner of R2P2 should be removed and R3P1 should have no drawPositions
*/
test('drawSize: 8 - Removing a DOUBLE_WALKOVER / Removing scored outcome in WOWO scenarios', () => {
  const drawProfiles = [{ drawSize: 8 }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  // keep track of notficiations with each setMatchUpStatus event
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

  // Target R1P1 and enter a DOUBLE_WALKOVER
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: DOUBLE_WALKOVER,
  });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 1],
    [2, 1],
  ]);
  modifiedMatchUpLog = [];

  // R2P1 should now be a produced WALKOVER
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  if (targetMatchUp.drawPositions) {
    expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([]);
  }
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toBeUndefined();

  // now target R1P2 and set outcome with score and winningSide
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-2',
    winningSide: 1,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 2],
    [2, 1],
    [3, 1],
  ]);
  modifiedMatchUpLog = [];

  // expect that winner of R1P2 (DP3) is progressed to and is the winner of R2P1
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3]);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(2);

  // expect that winner of R1P2 (DP3) is progressed to R3P1
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3]);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toEqual(undefined);

  // now remove DOUBLE_WALKOVER
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: undefined,
    matchUpStatus: TO_BE_PLAYED,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // three matchUps are modified
  expect(modifiedMatchUpLog).toEqual([
    [3, 1],
    [2, 1],
    [1, 1],
  ]);
  modifiedMatchUpLog = [];

  // DOUBLE_WALKOVER advanced winner is removed from R2P1
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3]);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toBeUndefined();
  expect(targetMatchUp.matchUpStatusCodes).toEqual(undefined);

  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.drawPositions).toEqual(undefined);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toBeUndefined();
  expect(targetMatchUp.matchUpStatusCodes?.length || 0).toEqual(0);

  // Bottom half of draw -----------------------------------------
  // Target R1P3 and enter a DOUBLE_WALKOVER
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 3 });
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: DOUBLE_WALKOVER,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 3],
    [2, 2],
  ]);
  modifiedMatchUpLog = [];

  // R2P2 should now be a produced WALKOVER
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  if (targetMatchUp.drawPositions) {
    expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([]);
  }
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toBeUndefined();

  // now target R1P4 and set outcome with score and winningSide
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 4 });
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-2',
    winningSide: 1,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 4],
    [2, 2],
    [3, 1],
  ]);
  modifiedMatchUpLog = [];

  // expect that winner of R1P3 (DP7) is progressed to and is the winner of R2P2
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([7]);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(2);

  // expect that winner of R1P3 (DP7) is progressed to R3P1
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([7]);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toEqual(undefined);

  // now remove R1P3 scored outcome
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 3 });
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: undefined,
    matchUpStatus: TO_BE_PLAYED,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // three matchUps are modified
  expect(modifiedMatchUpLog).toEqual([
    [3, 1],
    [2, 2],
    [1, 3],
  ]);
  modifiedMatchUpLog = [];

  // DOUBLE_WALKOVER advanced winner is removed from R2P2
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([7]);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toBeUndefined();
  expect(targetMatchUp.matchUpStatusCodes).toEqual(undefined);

  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.drawPositions).toEqual(undefined);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toBeUndefined();
  expect(targetMatchUp.matchUpStatusCodes?.length || 0).toEqual(0);
});

test('drawSize: 8 - Removing a DOUBLE_WALKOVER will remove produced WALKOVER in subsequent round', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          matchUpStatus: DOUBLE_WALKOVER,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-3',
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
          scoreString: '6-1 6-4',
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  // keep track of notficiations with each setMatchUpStatus event
  const modifiedMatchUpLog: any[] = [];
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
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(COMPLETED);
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 3 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 4 });
  expect(targetMatchUp.matchUpStatus).toEqual(COMPLETED);
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(2);
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(2);

  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: undefined,
    matchUpStatus: TO_BE_PLAYED,
  });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // DOUBLE_WALKOVER advanced winner is removed from R2P1
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3]);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toEqual(undefined);

  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 4 });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // DOUBLE_WALKOVER advanced winner is removed from R2P2
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.drawPositions).toEqual(undefined);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(undefined);

  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 3 });
  result = tournamentEngine.matchUpActions({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
  });
  expect(result.validActions.map(({ type }) => type).includes(SCORE)).toEqual(true);
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);
});

test('DOUBLE_WALKOVER cannot be removed when active downstream matchUps', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      participantsCount: 7,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          matchUpStatus: DOUBLE_WALKOVER,
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          scoreString: '6-1 6-3',
          winningSide: 1,
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          scoreString: '6-1 6-4',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 2,
          scoreString: '6-2 6-2',
          winningSide: 1,
        },
        {
          roundNumber: 3,
          roundPosition: 1,
          scoreString: '6-3 6-1',
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  // keep track of notficiations with each setMatchUpStatus event
  const modifiedMatchUpLog: any[] = [];
  let result = setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (matchUps) => {
        matchUps.forEach(({ matchUp }) => modifiedMatchUpLog.push([matchUp.roundNumber, matchUp.roundPosition]));
      },
    },
  });
  expect(result.success).toEqual(true);

  const { matchUps } = tournamentEngine.allTournamentMatchUps();

  // a DOUBLE_WALKOVER matchUp will not have SCORE option if { activeDownstream: true }
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  result = tournamentEngine.matchUpActions({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
  });
  expect(result.validActions.length).toEqual(2);
  expect(result.validActions[0].type).toEqual(REFEREE);

  // a produced WALKOVER matchUp will not have SCORE option if { activeDownstream: true }
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  result = tournamentEngine.matchUpActions({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
  });
  expect(result.validActions.length).toEqual(2);
  expect(result.validActions[0].type).toEqual(REFEREE);

  // attempting to score an active DOUBLE_WALKOVER matchUp will return an error
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: undefined,
    matchUpStatus: TO_BE_PLAYED,
  });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);
});

test('Removing DOUBLE_WALKOVER will remove BYE-Advanced WALKOVER Winner', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      participantsCount: 7,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 2,
          matchUpStatus: DOUBLE_WALKOVER,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  // keep track of notficiations with each setMatchUpStatus event
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

  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: undefined,
    matchUpStatus: TO_BE_PLAYED,
  });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(modifiedMatchUpLog).toEqual([
    [3, 1],
    [2, 1],
    [1, 2],
  ]);
  modifiedMatchUpLog = [];

  // produced WALKOVER advanced winner is removed from R3P1
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.drawPositions).toEqual(undefined);
});

test('drawSize: 8 - removing multiple DOUBLE_WALKOVERs cleans up WALKOVERs in subsequent rounds', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          matchUpStatus: DOUBLE_WALKOVER,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          matchUpStatus: DOUBLE_WALKOVER,
        },
      ],
    },
  ];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  // keep track of notficiations with each setMatchUpStatus event
  const modifiedMatchUpLog: any[] = [];
  let result = setSubscriptions({
    subscriptions: {
      [MODIFY_MATCHUP]: (matchUps) => {
        matchUps.forEach(({ matchUp }) => modifiedMatchUpLog.push([matchUp.roundNumber, matchUp.roundPosition]));
      },
    },
  });
  expect(result.success).toEqual(true);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();

  let targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);

  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: undefined,
    matchUpStatus: TO_BE_PLAYED,
  });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
});

test('drawSize: 16 - removing multiple DOUBLE_WALKOVERs cleans up WALKOVERs in subsequent rounds', () => {
  const drawProfiles = [{ drawSize: 16 }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  tournamentEngine.setState(tournamentRecord);

  // keep track of notficiations with each setMatchUpStatus event
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
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: DOUBLE_WALKOVER,
  });

  // Enter score for first 7 roundNumber: 1 matchUps
  matchUps
    .filter(({ roundNumber }) => roundNumber === 1)
    .forEach(({ matchUpId }) => {
      result = tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId,
        outcome,
      });
      expect(result.success).toEqual(true);
    });

  expect(modifiedMatchUpLog.length).toEqual(22);
  modifiedMatchUpLog = [];

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const statuses = matchUps.reduce((statuses, matchUp) => {
    const { matchUpStatus } = matchUp;
    return statuses.includes(matchUpStatus) ? statuses : statuses.concat(matchUpStatus);
  }, []);
  expect(statuses).toEqual([DOUBLE_WALKOVER]);

  let targetMatchUp = getTarget({ matchUps, roundNumber: 4, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: undefined,
    matchUpStatus: TO_BE_PLAYED,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  modifiedMatchUpLog = [];
});

test('A produced WALKOVER in the Final will be replaced by a propagated winner', () => {
  const drawProfiles = [{ drawSize: 16 }];
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
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: DOUBLE_WALKOVER,
  });

  // Enter score for first 7 roundNumber: 1 matchUps
  matchUps
    .filter(({ roundNumber, roundPosition }) => roundNumber === 1 && roundPosition < 8)
    .forEach(({ matchUpId }) => {
      result = tournamentEngine.setMatchUpStatus({
        drawId,
        matchUpId,
        outcome,
      });
      expect(result.success).toEqual(true);
    });

  expect(modifiedMatchUpLog.length).toEqual(18);
  modifiedMatchUpLog = [];

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const statuses = matchUps.reduce((statuses, matchUp) => {
    const { matchUpStatus } = matchUp;
    return statuses.includes(matchUpStatus) ? statuses : statuses.concat(matchUpStatus);
  }, []);
  expect(statuses).toEqual([DOUBLE_WALKOVER, WALKOVER, TO_BE_PLAYED]);

  let targetMatchUp = getTarget({ matchUps, roundNumber: 4, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);

  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 8 });
  // now set the final roundNumber: 1 matchUpStatus to be DOUBLE_WALKOVER
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(modifiedMatchUpLog).toEqual([
    [1, 8],
    [2, 4],
    [3, 2],
    [4, 1],
  ]);
  modifiedMatchUpLog = [];

  // the Final (R4P1) should be DOUBLE_WALKOVER when all feeders are exits
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  targetMatchUp = getTarget({ matchUps, roundNumber: 4, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-2',
    winningSide: 1,
  }));
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  expect(modifiedMatchUpLog).toEqual([
    [1, 1],
    [2, 1],
    [3, 1],
    [4, 1],
  ]);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(1);
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(1);
  targetMatchUp = getTarget({ matchUps, roundNumber: 4, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(1);
});

test('consolation fed player advanced by WO/WO will be removed when WO/WO cleared', () => {
  const completionGoal = 6;
  const drawProfiles = [
    {
      drawType: FEED_IN_CHAMPIONSHIP_TO_SF,
      completionGoal,
      drawSize: 8,
      outcomes: [
        {
          matchUpStatus: DOUBLE_WALKOVER,
          matchUpStatusCodes: ['WOWO'],
          stage: CONSOLATION,
          roundPosition: 1,
          roundNumber: 1,
        },
      ],
    },
  ];
  const mockProfile = { drawProfiles };

  let result = mocksEngine.generateTournamentRecord(mockProfile);
  const { tournamentRecord } = result;

  tournamentEngine.setState(tournamentRecord);

  let matchUps = tournamentEngine.tournamentMatchUps();
  // DOUBLE_WALKOVER produces 2 additional completed matchUps
  expect(matchUps.completedMatchUps.length).toEqual(completionGoal + 2);

  let targetMatchUp = getTarget({
    matchUps: matchUps.pendingMatchUps,
    stage: CONSOLATION,
    roundPosition: 1,
    roundNumber: 3,
  });

  // The consolation final should have a WALKOVER advanced drawPosition
  expect(targetMatchUp.drawPositions.includes(1)).toEqual(true);
  expect(targetMatchUp.finishingRound).toEqual(1);

  targetMatchUp = getTarget({
    matchUps: matchUps.completedMatchUps,
    stage: CONSOLATION,
    roundPosition: 1,
    roundNumber: 2,
  });

  // expect the consolation semifinal to be a produced WALKOVER
  expect(targetMatchUp.drawPositions.includes(1)).toEqual(true);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);

  targetMatchUp = getTarget({
    matchUps: matchUps.completedMatchUps,
    stage: CONSOLATION,
    roundPosition: 1,
    roundNumber: 1,
  });

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    drawId: targetMatchUp.drawId,
    outcome: toBePlayed,
  });

  expect(result.success).toEqual(true);
  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  targetMatchUp = getTarget({
    stage: CONSOLATION,
    roundPosition: 1,
    roundNumber: 2,
    matchUps,
  });
  expect(targetMatchUp.drawPositions.includes(1)).toEqual(true);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);

  targetMatchUp = getTarget({
    stage: CONSOLATION,
    roundPosition: 1,
    roundNumber: 3,
    matchUps,
  });

  expect(targetMatchUp.drawPositions).toEqual(undefined);
});
