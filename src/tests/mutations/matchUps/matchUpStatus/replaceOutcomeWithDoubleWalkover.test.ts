import { setSubscriptions } from '@Global/state/globalState';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';
import { MODIFY_MATCHUP } from '@Constants/topicConstants';

const getTarget = ({ matchUps, roundNumber, roundPosition }) =>
  matchUps.find((matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);

/*
  drawSize: 4
  R1P1 is entered as a DOUBLE_WALKOVER, which produces a WALKOVER in R2P1
  R1P2 score is entered progressing winner to R2P1; winner of R1P2 is also winner of R2P1 by WALKOVER
  R1P1 DOUBLE_WALKOVER is replaced with score which removes winner from R2P1
*/
test('Replacing an outcome with a DOUBLE_WALKOVER will advance paired position', () => {
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

  // Target R1P1 and enter a scored outcome
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-2',
    winningSide: 1,
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

  // R2P1 should now include DP1 and have matchUpStatus TO_BE_PLAYED
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
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

  // R2P1 should now include [DP1, DP3] and have matchUpStatus TO_BE_PLAYED
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1, 3]);
  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  expect(targetMatchUp.winningSide).toBeUndefined();

  // now target R1P2 and modify the result to be a DOUBLE_WALKOVER
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
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
    [1, 2],
    [2, 1],
  ]);
  modifiedMatchUpLog = [];

  // DOUBLE_WALKOVER advanced winner is removed from R2P1
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(1);
  expect(targetMatchUp.matchUpStatusCodes.filter((code) => !code.sideNumber)).toEqual([]);
});
