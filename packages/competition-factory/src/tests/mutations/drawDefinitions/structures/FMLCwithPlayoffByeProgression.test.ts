import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { CONSOLATION, FIRST_MATCH_LOSER_CONSOLATION, MAIN, PLAY_OFF } from '@Constants/drawDefinitionConstants';
import { BYE, COMPLETED, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';

it('will place a BYE in CONSOLATION if participant has progressed to 3-4 playoff', () => {
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        participantsCount: 6,
        drawSize: 8,
        outcomes: [
          {
            roundNumber: 1,
            roundPosition: 2,
            winningSide: 1,
          },
          {
            roundNumber: 1,
            roundPosition: 3,
            winningSide: 2,
          },
        ],
      },
    ],
  });

  let result = tournamentEngine.setState(tournamentRecord);
  expect(result.success).toEqual(true);

  let matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [COMPLETED] },
  }).matchUps;
  expect(matchUps.length).toEqual(2);

  result = tournamentEngine.getAvailablePlayoffProfiles({ drawId });
  const { positionsPlayedOff } = result;
  const { playoffRounds, structureId } = result.availablePlayoffProfiles[0];

  expect(positionsPlayedOff).toEqual([1, 2, 5, 6]);
  expect(playoffRounds).toEqual([2]);

  const roundProfiles = [{ [2]: 1 }];
  result = tournamentEngine.generateAndPopulatePlayoffStructures({
    roundProfiles,
    structureId,
    drawId,
  });
  expect(result.success).toEqual(true);

  result = tournamentEngine.attachPlayoffStructures({ drawId, ...result });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps({
    matchUpFilters: { matchUpStatuses: [TO_BE_PLAYED] },
  }).matchUps;

  const playoffMatchUps = matchUps.filter(({ stage }) => stage === PLAY_OFF);
  expect(playoffMatchUps.length).toEqual(1);

  let playoff34 = matchUps.find(({ matchUpId }) => matchUpId === playoffMatchUps[0].matchUpId);
  expect(playoff34.sides[0].participantId).toBeUndefined();

  let fmlcTarget = matchUps.find(
    (matchUp) => matchUp.stage === CONSOLATION && matchUp.roundNumber === 2 && matchUp.roundPosition === 1,
  );
  expect(fmlcTarget.matchUpStatus).toEqual(TO_BE_PLAYED);

  const targetMatchUp = matchUps.find(
    ({ stage, roundNumber, roundPosition }) => stage === MAIN && roundNumber === 2 && roundPosition === 1,
  );
  let { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-1',
    winningSide: 2,
  });

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  // loser from 2nd round main has progressed to 3-4 playoff
  playoff34 = matchUps.find(({ matchUpId }) => matchUpId === playoffMatchUps[0].matchUpId);
  expect(playoff34.sides[0].participantId).not.toBeUndefined();

  fmlcTarget = matchUps.find(
    (matchUp) => matchUp.stage === CONSOLATION && matchUp.roundNumber === 2 && matchUp.roundPosition === 1,
  );
  expect(fmlcTarget.matchUpStatus).toEqual(BYE);

  ({ outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: TO_BE_PLAYED,
    winningSide: undefined,
  }));

  result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.allTournamentMatchUps().matchUps;

  // loser from 2nd round main has progressed to 3-4 playoff
  playoff34 = matchUps.find(({ matchUpId }) => matchUpId === playoffMatchUps[0].matchUpId);
  expect(playoff34.sides[0].participantId).toBeUndefined();

  fmlcTarget = matchUps.find(
    (matchUp) => matchUp.stage === CONSOLATION && matchUp.roundNumber === 2 && matchUp.roundPosition === 1,
  );
  expect(fmlcTarget.matchUpStatus).toEqual(TO_BE_PLAYED);
});
