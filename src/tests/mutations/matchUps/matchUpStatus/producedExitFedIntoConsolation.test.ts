import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

import { DOUBLE_WALKOVER, BYE } from '@Constants/matchUpStatusConstants';
import { CONSOLATION, FEED_IN_CHAMPIONSHIP, MAIN } from '@Constants/drawDefinitionConstants';

it('properly handles produced Exit fed into consolation structure', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        idPrefix: 'm',
        drawType: FEED_IN_CHAMPIONSHIP,
        participantsCount: 5,
        drawSize: 8,
      },
    ],
  });

  tournamentEngine.setState(tournamentRecord);

  // FIRST: find the 2nd Round MAIN matchUp which is readyToScore
  // Entering a DOUBLE_WALKOVER will produce a WALKOVER in both MAIN and CONSOLATION
  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  let targetMatchUp = matchUps.find(
    ({ stage, roundNumber, readyToScore }) => stage === MAIN && roundNumber === 2 && readyToScore,
  );
  const topHalf = Math.max(...targetMatchUp.drawPositions) < 5;

  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  // SECOND: find the CONSOLATION matchUp and confirm the presence of the produced BYE
  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  targetMatchUp = matchUps.find(
    ({ matchUpId, matchUpStatus, stage }) =>
      matchUpId === targetMatchUp.loserMatchUpId && matchUpStatus === BYE && stage === CONSOLATION,
  );

  // NOTE: whether the MAIN matchUp was in the Top Half or Bottom Half effects location in CONSOLATION
  // consolation 2nd round matchUps are:
  // -> { roundPosition: 1, drawPositions: [2,] }
  // -> { roundPosition: 2, drawPositions: [3,] }
  expect(targetMatchUp.drawPositions.includes(topHalf ? 3 : 2)).toEqual(true);

  // THIRD: attempt to complete the MAIN first round matchUp
  // the loser of which would be advanced to the CONSOLATION 3rd round by the produced WALKOVER

  targetMatchUp = matchUps.find(
    ({ stage, roundNumber, readyToScore }) => stage === MAIN && roundNumber === 1 && readyToScore,
  );

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);
});
