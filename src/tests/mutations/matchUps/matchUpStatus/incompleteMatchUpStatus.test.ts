import { getContextMatchUp, getOrderedDrawPositionPairs } from '@Tests/mutations/drawDefinitions/testingUtilities';
import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { INCOMPATIBLE_MATCHUP_STATUS } from '@Constants/errorConditionConstants';
import { INCOMPLETE } from '@Constants/matchUpStatusConstants';

it('DISALLOWS entry of incomplete result if active downstream', () => {
  const drawProfiles = [
    {
      drawSize: 8,
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
          scoreString: '6-1 6-2',
          winningSide: 1,
        },
        {
          roundNumber: 2,
          roundPosition: 1,
          scoreString: '6-2 6-1',
          winningSide: 1,
        },
      ],
    },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  const { matchUps } = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps();
  const { matchUp } = getContextMatchUp({
    roundPosition: 1,
    roundNumber: 1,
    matchUps,
  });
  const { drawId, matchUpId, structureId } = matchUp;

  const values = {
    matchUpStatus: INCOMPLETE,
    scoreString: '6-1',
  };
  const { outcome } = mocksEngine.generateOutcomeFromScoreString(values);
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.error).toEqual(INCOMPATIBLE_MATCHUP_STATUS);

  const { filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId });
  expect(filteredOrderedPairs.filter((p) => p && p.length)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [1, 3], [1]]);
});

it('removes advanced participant when completed score changes to incomplete result', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      outcomes: [
        {
          scoreString: '6-1 6-1',
          roundPosition: 1,
          roundNumber: 1,
          winningSide: 1,
        },
        {
          scoreString: '6-1 6-2',
          roundPosition: 2,
          roundNumber: 1,
          winningSide: 1,
        },
      ],
    },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  let { matchUps } = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps();
  let { matchUp } = getContextMatchUp({
    roundPosition: 1,
    roundNumber: 1,
    matchUps,
  });
  const { drawId, matchUpId, structureId } = matchUp;

  const values = {
    matchUpStatus: INCOMPLETE,
    scoreString: '6-1',
  };
  const { outcome } = mocksEngine.generateOutcomeFromScoreString(values);
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  const { filteredOrderedPairs } = getOrderedDrawPositionPairs({ structureId });
  expect(filteredOrderedPairs.filter((p) => p && p.length)).toEqual([[1, 2], [3, 4], [5, 6], [7, 8], [3]]);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  ({ matchUp } = getContextMatchUp({
    roundPosition: 1,
    roundNumber: 1,
    matchUps,
  }));
  expect(matchUp.score.scoreStringSide1).toEqual('6-1');
});

it('removes advanced participant in FINAL when completed score changes to incomplete result', () => {
  const drawProfiles = [
    {
      drawSize: 2,
      outcomes: [
        {
          scoreString: '6-1 6-1',
          roundPosition: 1,
          roundNumber: 1,
          winningSide: 1,
        },
      ],
    },
  ];
  const { tournamentRecord } = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  let { matchUps } = tournamentEngine.setState(tournamentRecord).allTournamentMatchUps();
  let { matchUp } = getContextMatchUp({
    roundPosition: 1,
    roundNumber: 1,
    matchUps,
  });
  const { drawId, matchUpId } = matchUp;

  const values = {
    matchUpStatus: INCOMPLETE,
    scoreString: '6-1',
  };
  const { outcome } = mocksEngine.generateOutcomeFromScoreString(values);
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  ({ matchUp } = getContextMatchUp({
    roundPosition: 1,
    roundNumber: 1,
    matchUps,
  }));
  expect(matchUp.score.scoreStringSide1).toEqual('6-1');
  expect(matchUp.matchUpStatus).toEqual(INCOMPLETE);
  expect(matchUp.winningSide).toBeUndefined();
});
