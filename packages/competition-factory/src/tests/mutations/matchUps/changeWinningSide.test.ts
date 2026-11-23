import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { COMPASS, FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { CANNOT_CHANGE_WINNING_SIDE } from '@Constants/errorConditionConstants';

// This should only apply when eventType is SINGLES or DOUBLES, NOT WHEN TEAM!
test('changing winningSide can propagate changes through multiple structures', () => {
  const drawSize = 32;
  const expectedMatchUpsCount = 72; // 31 + 15 + 7 + 7 + 3 + 3 + 3 + 3
  const drawProfiles = [{ drawType: COMPASS, drawSize }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  let matchUps = tournamentEngine.tournamentMatchUps();
  const { completedMatchUps, matchUpsCount } = matchUps;
  expect(completedMatchUps.length).toEqual(expectedMatchUpsCount);
  expect(matchUpsCount).toEqual(expectedMatchUpsCount);

  const firstMatchUp = completedMatchUps.find(
    ({ roundNumber, roundPosition, structureName }) =>
      roundNumber === 1 && roundPosition === 1 && structureName === 'East',
  );
  const firstMatchUpWinnerParticipantId = firstMatchUp.sides.find(
    ({ sideNumber }) => sideNumber === firstMatchUp.winningSide,
  ).participantId;
  const firstMatchUpLoserParticipantId = firstMatchUp.sides.find(
    ({ sideNumber }) => sideNumber !== firstMatchUp.winningSide,
  ).participantId;
  const westFinal = completedMatchUps.find(
    ({ finishingRound, structureName }) => finishingRound === 1 && structureName === 'West',
  );
  const westFinalWinnerParticipantId = westFinal.sides.find(
    ({ sideNumber }) => sideNumber === westFinal.winningSide,
  ).participantId;

  expect(firstMatchUpLoserParticipantId).toEqual(westFinalWinnerParticipantId);

  let result = tournamentEngine.devContext({ winningSideChange: true }).setMatchUpStatus({
    matchUpId: firstMatchUp.matchUpId,
    allowChangePropagation: false,
    outcome: { winningSide: 2 },
    drawId,
  });
  expect(result.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);

  result = tournamentEngine.devContext({ winningSideChange: true }).setMatchUpStatus({
    matchUpId: firstMatchUp.matchUpId,
    allowChangePropagation: true,
    outcome: { winningSide: 2 },
    drawId,
  });
  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.tournamentMatchUps();
  const updatedWestFinal = matchUps.completedMatchUps.find(({ matchUpId }) => matchUpId === westFinal.matchUpId);
  const updatedWestFinalWinnerParticipantId = updatedWestFinal.sides.find(
    ({ sideNumber }) => sideNumber === westFinal.winningSide,
  ).participantId;

  expect(firstMatchUpWinnerParticipantId).toEqual(updatedWestFinalWinnerParticipantId);
});

test('changing winningSide can propagate changes through FMLC', () => {
  const drawSize = 16;
  const expectedMatchUpsCount = 26; // 31 + 15 + 7 + 7 + 3 + 3 + 3 + 3
  const drawProfiles = [{ drawType: FIRST_MATCH_LOSER_CONSOLATION, drawSize }];
  const {
    tournamentRecord,
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles,
    completeAllMatchUps: true,
  });

  tournamentEngine.setState(tournamentRecord);

  let matchUps = tournamentEngine.tournamentMatchUps();
  const { completedMatchUps, byeMatchUps, matchUpsCount } = matchUps;

  expect(completedMatchUps.length + byeMatchUps.length).toEqual(expectedMatchUpsCount);
  expect(matchUpsCount).toEqual(expectedMatchUpsCount);

  const firstMatchUp = completedMatchUps.find(
    ({ roundNumber, roundPosition, structureName }) =>
      roundNumber === 1 && roundPosition === 1 && structureName === 'Main',
  );
  const firstMatchUpWinnerParticipantId = firstMatchUp.sides.find(
    ({ sideNumber }) => sideNumber === firstMatchUp.winningSide,
  ).participantId;
  const firstMatchUpLoserParticipantId = firstMatchUp.sides.find(
    ({ sideNumber }) => sideNumber !== firstMatchUp.winningSide,
  ).participantId;
  const consolationFinal = completedMatchUps.find(
    ({ finishingRound, structureName }) => finishingRound === 1 && structureName === 'Consolation',
  );
  const consolationFinalParticipantId = consolationFinal.sides.find(
    ({ sideNumber }) => sideNumber === consolationFinal.winningSide,
  ).participantId;

  expect(firstMatchUpLoserParticipantId).toEqual(consolationFinalParticipantId);

  let result = tournamentEngine.devContext({ winningSideChange: true }).setMatchUpStatus({
    matchUpId: firstMatchUp.matchUpId,
    allowChangePropagation: false,
    outcome: { winningSide: 2 },
    drawId,
  });
  expect(result.error).toEqual(CANNOT_CHANGE_WINNING_SIDE);

  result = tournamentEngine.devContext({ winningSideChange: true }).setMatchUpStatus({
    matchUpId: firstMatchUp.matchUpId,
    allowChangePropagation: true,
    outcome: { winningSide: 2 },
    drawId,
  });

  expect(result.success).toEqual(true);

  matchUps = tournamentEngine.tournamentMatchUps();
  const updatedWestFinal = matchUps.completedMatchUps.find(({ matchUpId }) => matchUpId === consolationFinal.matchUpId);
  const updatedConsolationFinalParticipantId = updatedWestFinal.sides.find(
    ({ sideNumber }) => sideNumber === consolationFinal.winningSide,
  ).participantId;

  expect(firstMatchUpWinnerParticipantId).toEqual(updatedConsolationFinalParticipantId);
});
