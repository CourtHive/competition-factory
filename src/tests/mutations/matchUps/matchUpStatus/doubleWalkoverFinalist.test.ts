import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

const getTarget = ({ matchUps, roundNumber, roundPosition }) =>
  matchUps.find((matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);

it('DOUBLE_WALKOVER can Advance participant to final when scores entered after WOWO', () => {
  const drawProfiles = [
    {
      drawSize: 4,
      outcomes: [
        {
          matchUpStatus: DOUBLE_WALKOVER,
          roundPosition: 1,
          roundNumber: 1,
        },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });

  tournamentEngine.setState(tournamentRecord);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);

  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    scoreString: '6-1 6-2',
    winningSide: 1,
  });
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.winningSide).toEqual(2);
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([3]);

  const { completedMatchUps } = tournamentEngine.drawMatchUps({
    drawId,
  });
  expect(completedMatchUps.length).toEqual(3);
});

it('DOUBLE_WALKOVER can Advance participant to final when scores are present', () => {
  const drawProfiles = [
    {
      drawSize: 4,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          scoreString: '6-1 6-2',
          winningSide: 1,
        },
      ],
    },
  ];
  const {
    drawIds: [drawId],
    tournamentRecord,
  } = mocksEngine.generateTournamentRecord({ drawProfiles });
  tournamentEngine.setState(tournamentRecord);

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(COMPLETED);
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);

  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  const { outcome } = mocksEngine.generateOutcomeFromScoreString({
    matchUpStatus: DOUBLE_WALKOVER,
  });
  const result = tournamentEngine.setMatchUpStatus({
    matchUpId: targetMatchUp.matchUpId,
    outcome,
    drawId,
  });
  expect(result.success).toEqual(true);

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.winningSide).toEqual(1);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);

  const { completedMatchUps } = tournamentEngine.drawMatchUps({
    drawId,
  });
  expect(completedMatchUps.length).toEqual(3);
});
