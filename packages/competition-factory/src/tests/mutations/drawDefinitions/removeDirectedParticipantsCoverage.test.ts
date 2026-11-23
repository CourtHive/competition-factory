import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { FIRST_MATCH_LOSER_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';

test('removing match result in consolation draw triggers removeDirectedParticipants', () => {
  // Create a draw with consolation links to exercise winner/loser propagation removal
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ],
    setState: true,
  });

  // Complete first round matchUps
  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const matchUp = matchUps.find((m) => m.roundNumber === 1 && m.drawPositions?.length === 2);
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-3 6-4',
    winningSide: 1,
  });

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Now remove the outcome - this triggers removeDirectedParticipants
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: matchUp.matchUpId,
    outcome: { winningSide: undefined, score: undefined },
    drawId,
  });
  expect(result.success).toEqual(true);
});

test('double walkover in consolation draw exercises removal path', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
      },
    ],
    setState: true,
  });

  const { matchUps } = tournamentEngine.allTournamentMatchUps();
  const firstRoundMatchUp = matchUps.find((m) => m.roundNumber === 1);

  // Set double walkover
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: DOUBLE_WALKOVER,
  });

  let result = tournamentEngine.setMatchUpStatus({
    matchUpId: firstRoundMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  // Remove the double walkover
  result = tournamentEngine.setMatchUpStatus({
    matchUpId: firstRoundMatchUp.matchUpId,
    outcome: { winningSide: undefined, score: undefined },
    drawId,
  });
  expect(result.success).toEqual(true);
});

test('completing and removing results across rounds in consolation draw', () => {
  const {
    drawIds: [drawId],
  } = mocksEngine.generateTournamentRecord({
    drawProfiles: [
      {
        drawSize: 8,
        drawType: FIRST_MATCH_LOSER_CONSOLATION,
        seedsCount: 4,
      },
    ],
    setState: true,
  });

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  const firstRoundMatchUps = matchUps.filter((m) => m.roundNumber === 1 && m.drawPositions?.every(Boolean));

  // Complete all first round matchUps to propagate winners and losers
  for (const matchUp of firstRoundMatchUps) {
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-2 6-3',
      winningSide: 1,
    });
    const result = tournamentEngine.setMatchUpStatus({
      matchUpId: matchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);
  }

  // Complete a second round match to further propagate
  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  const secondRoundMatchUp = matchUps.find(
    (m) => m.roundNumber === 2 && m.drawPositions?.every(Boolean) && !m.winningSide,
  );
  if (secondRoundMatchUp) {
    const { outcome } = mocksEngine.generateOutcomeFromScoreString({
      scoreString: '6-4 6-4',
      winningSide: 2,
    });
    let result = tournamentEngine.setMatchUpStatus({
      matchUpId: secondRoundMatchUp.matchUpId,
      outcome,
      drawId,
    });
    expect(result.success).toEqual(true);

    // Remove the second round result - exercises removeDirectedWinner
    result = tournamentEngine.setMatchUpStatus({
      matchUpId: secondRoundMatchUp.matchUpId,
      outcome: { winningSide: undefined, score: undefined },
      drawId,
    });
    expect(result.success).toEqual(true);
  }
});
