import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { generateRange } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants
import { COMPLETED, DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { CONSOLATION } from '@Constants/drawDefinitionConstants';
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

test('A produced WALKOVER encountering a produced WALKOVER winningSide will not continue propagation', () => {
  const drawProfiles = [
    {
      drawSize: 16,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          matchUpStatus: DOUBLE_WALKOVER,
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          scoreString: '6-1 6-2',
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

  // Enter Score in R1P4
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 4 });
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });

  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 4],
    [2, 2],
    [3, 1],
  ]);
  modifiedMatchUpLog = [];

  // expect R2P2 to be a produced WALKOVER
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([7]);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(2);

  // expect R3P1 to have two drawPositions and matchUpStatus: TO_BE_PLAYED
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3, 7]);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toEqual(undefined);

  // expect R4P1 to have no drawPositions and matchUpStatus: TO_BE_PLAYED
  targetMatchUp = getTarget({ matchUps, roundNumber: 4, roundPosition: 1 });
  if (targetMatchUp.drawPositions) {
    expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([]);
  }
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toEqual(undefined);

  // Enter Score in R1P5
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 5 });
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 5],
    [2, 3],
  ]);
  modifiedMatchUpLog = [];

  // Enter Score in R1P7
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 7 });
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 7],
    [2, 4],
  ]);
  modifiedMatchUpLog = [];

  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: DOUBLE_WALKOVER,
  }));
  // Enter DOUBLE_WALKOVER in R1P6
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 6 });
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 6],
    [2, 3],
    [3, 2],
  ]);
  modifiedMatchUpLog = [];

  // Enter DOUBLE_WALKOVER in R1P8
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 8 });
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [1, 8],
    [2, 4],
    [3, 2],
  ]);
  modifiedMatchUpLog = [];

  // Enter DOUBLE_WALKOVER in R3P1
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [3, 1],
    [4, 1],
  ]);
  modifiedMatchUpLog = [];

  // enter result in R3P2
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  }));
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 2 });
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [3, 2],
    [4, 1],
  ]);
  modifiedMatchUpLog = [];

  // now refresh matchUps and remove outcomes
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 4, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([9]);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(2);

  // now remove outcomes
  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    winningSide: undefined,
    matchUpStatus: TO_BE_PLAYED,
  }));
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [4, 1],
    [3, 1],
  ]);
  modifiedMatchUpLog = [];

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 4, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([9]);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toEqual(undefined);

  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 2 });
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId: targetMatchUp.matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);
  expect(modifiedMatchUpLog).toEqual([
    [3, 2],
    [4, 1],
  ]);
  modifiedMatchUpLog = [];

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 4, roundPosition: 1 });
  expect(targetMatchUp.drawPositions).toEqual(undefined);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toEqual(undefined);

  generateRange(1, 9).forEach((roundPosition) => {
    targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition });
    result = tournamentEngine.setMatchUpStatus({
      drawId,
      matchUpId: targetMatchUp.matchUpId,
      outcome,
    });
    expect(result.success).toEqual(true);
  });

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  matchUps.forEach((matchUp) => {
    expect(matchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
    expect(matchUp.winningSide).toEqual(undefined);
    const drawPositions = matchUp.drawPositions?.filter(Boolean);
    expect(drawPositions?.length).toEqual(matchUp.roundNumber === 1 ? 2 : undefined);
  });
});

test('DOUBLE_WALKOVER in feedRound does not inappropriately advance drawPositions for other roundPositions', () => {
  const completionGoal = 6;
  const drawProfiles = [
    {
      drawSize: 8,
      drawType: 'FEED_IN_CHAMPIONSHIP_TO_SF',
      completionGoal,
      outcomes: [
        {
          stage: 'CONSOLATION',
          roundNumber: 1,
          roundPosition: 1,
          matchUpStatus: 'DOUBLE_WALKOVER',
          matchUpStatusCodes: ['WOWO'],
        },
      ],
    },
  ];
  const mockProfile = { drawProfiles };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord(mockProfile);

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
    matchUps: matchUps.upcomingMatchUps,
    stage: CONSOLATION,
    roundPosition: 2,
    roundNumber: 1,
  });

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-1',
    winningSide: 1,
  });
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    drawId: targetMatchUp.drawId,
    outcome,
  });

  expect(result.success).toEqual(true);
  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  targetMatchUp = getTarget({
    stage: CONSOLATION,
    roundPosition: 2,
    roundNumber: 1,
    matchUps,
  });
  expect(targetMatchUp.matchUpStatus).toEqual(COMPLETED);

  targetMatchUp = getTarget({
    stage: CONSOLATION,
    roundPosition: 1,
    roundNumber: 3,
    matchUps,
  });

  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
});
