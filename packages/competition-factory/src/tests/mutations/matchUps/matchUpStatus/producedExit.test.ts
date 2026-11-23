import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER, TO_BE_PLAYED, WALKOVER } from '@Constants/matchUpStatusConstants';

test('A produced WALKOVER or DEFAULTED matchUpStatus will not cause prior rounds to be considered active positions', () => {
  const mockProfile = {
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        participantsCount: 9,
        drawSize: 16,
      },
    ],
  };

  const { tournamentRecord } = mocksEngine.generateTournamentRecord(mockProfile);

  tournamentEngine.setState(tournamentRecord);

  let matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  let targetMatchUp = matchUps.find(
    ({ stage, roundNumber, sides }) =>
      stage === MAIN && roundNumber === 1 && sides.every(({ participant }) => participant),
  );

  // ensure roundNumber: 1, roundPosition: 8 has two participants
  const { drawId, structureId, drawPositions } = targetMatchUp;
  if (!targetMatchUp.drawPositions.includes(16)) {
    const drawPosition = drawPositions[0];
    const result = tournamentEngine.swapDrawPositionAssignments({
      drawPositions: [drawPosition, 15],
      structureId,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  targetMatchUp = matchUps.find(
    ({ stage, roundNumber, sides }) =>
      stage === MAIN && roundNumber === 1 && sides.every(({ participant }) => participant),
  );
  expect(targetMatchUp.drawPositions).toEqual([15, 16]);

  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '7-5 7-5',
    winningSide: 1,
  });

  const targetMatchUps = matchUps.filter(
    ({ stage, roundNumber, roundPosition }) => stage === MAIN && roundNumber === 2 && roundPosition < 4,
  );

  // complete the first 3 matchUps of roundNumber: 2 of MAIN
  for (const matchUp of targetMatchUps) {
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // cause a WALKOVER to be produced for CONSOLATION final
  targetMatchUp = matchUps.find(
    ({ stage, roundNumber, roundPosition }) => stage === CONSOLATION && roundNumber === 3 && roundPosition === 1,
  );
  let result = tournamentEngine.setMatchUpStatus({
    outcome: { matchUpStatus: DOUBLE_WALKOVER },
    matchUpId: targetMatchUp.matchUpId,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  targetMatchUp = matchUps.find(({ stage, finishingRound }) => stage === CONSOLATION && finishingRound === 1);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.roundName).toEqual('C-Final');

  // check that one C-Quarterfinal matchUp has no assigned drawPositions
  targetMatchUp = matchUps.find(
    ({ stage, roundNumber, sides }) =>
      sides.every((side) => !side.participant && !side.bye) && stage === CONSOLATION && roundNumber === 2,
  );
  expect(targetMatchUp.roundPosition).toEqual(4);
  const matchUpOfIdOfInterest = targetMatchUp.matchUpId;

  // complete MAIN first round match to propagate first participants to
  targetMatchUp = matchUps.find(
    ({ stage, roundNumber, sides }) =>
      stage === MAIN && roundNumber === 1 && sides.every(({ participant }) => participant),
  );
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // attempt to complete MAIN matchUp that will propagate BYE to CONSOLATION
  targetMatchUp = matchUps.find(
    ({ stage, roundNumber, roundPosition }) => stage === MAIN && roundNumber === 2 && roundPosition === 4,
  );

  expect(targetMatchUp.matchUpStatus).toEqual(TO_BE_PLAYED);
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;
  targetMatchUp = matchUps.find(({ matchUpId }) => matchUpId === matchUpOfIdOfInterest);
  expect(targetMatchUp.sides.find(({ sideNumber }) => sideNumber === 1).bye).toEqual(true);
});
