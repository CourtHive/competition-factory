import { getOrderedDrawPositionPairs } from '@Tests/mutations/drawDefinitions/testingUtilities';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { ABANDONED, COMPLETED } from '@Constants/matchUpStatusConstants';

it('can set matchUp score and advance winningSide when changing from ABANDONED matchUpStatus', () => {
  const drawProfiles = [
    {
      drawSize: 8,
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  const { upcomingMatchUps } = tournamentEngine.setState(tournamentRecord).drawMatchUps({ drawId });
  const matchUpId = upcomingMatchUps[0].matchUpId;

  let result;
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId,
    outcome: { matchUpStatus: ABANDONED },
  });
  expect(result.success).toEqual(true);

  const { matchUp } = tournamentEngine.findMatchUp({ drawId, matchUpId });
  expect(matchUp.matchUpStatus).toEqual(ABANDONED);

  const values = {
    scoreString: '6-1 6-1',
    winningSide: 1,
    matchUpStatus: COMPLETED,
  };
  const { outcome } = mocksEngine.generateOutcomeFromScoreString(values);
  result = tournamentEngine.setMatchUpStatus({
    drawId,
    matchUpId,
    outcome,
  });
  expect(result.success).toEqual(true);

  const { completedMatchUps } = tournamentEngine.drawMatchUps({ drawId });
  expect(completedMatchUps[0].matchUpId).toEqual(matchUpId);

  const { filteredOrderedPairs } = getOrderedDrawPositionPairs();
  expect(filteredOrderedPairs.filter((p) => p && p.length)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [1]]);
});
