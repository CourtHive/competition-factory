import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, test } from 'vitest';

// constants
import { COMPLETED, DOUBLE_WALKOVER, WALKOVER } from '@Constants/matchUpStatusConstants';

const getTarget = ({ matchUps, roundNumber, roundPosition }) =>
  matchUps.find((matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);

// test added to address improper score propagation discovered during testing
test('Replacing a DOUBLE_WALKOVER which has produced WALKOVERs with a score will not propagate score', () => {
  const drawProfiles = [
    {
      drawSize: 8,
      outcomes: [
        {
          roundNumber: 1,
          roundPosition: 1,
          matchUpStatus: 'DOUBLE_WALKOVER',
        },
        {
          roundNumber: 1,
          roundPosition: 2,
          matchUpStatus: 'DOUBLE_WALKOVER',
        },
        {
          roundNumber: 1,
          roundPosition: 3,
          matchUpStatus: 'DOUBLE_WALKOVER',
        },
        {
          roundNumber: 1,
          roundPosition: 4,
          matchUpStatus: 'DOUBLE_WALKOVER',
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

  let { matchUps } = tournamentEngine.allTournamentMatchUps();
  let targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(targetMatchUp.winningSide).toBeUndefined();
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(targetMatchUp.winningSide).toBeUndefined();
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 3 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(targetMatchUp.winningSide).toBeUndefined();
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 4 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(targetMatchUp.winningSide).toBeUndefined();

  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(targetMatchUp.winningSide).toBeUndefined();
  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 2 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(targetMatchUp.winningSide).toBeUndefined();
  targetMatchUp = getTarget({ matchUps, roundNumber: 3, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);
  expect(targetMatchUp.winningSide).toBeUndefined();

  tournamentEngine.devContext({ scorePropagation: true });
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
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
  tournamentEngine.devContext({ scorePropagation: false });

  ({ matchUps } = tournamentEngine.allTournamentMatchUps());
  targetMatchUp = getTarget({ matchUps, roundNumber: 1, roundPosition: 1 });
  expect(targetMatchUp.matchUpStatus).toEqual(COMPLETED);
  expect(targetMatchUp.winningSide).toEqual(1);

  targetMatchUp = getTarget({ matchUps, roundNumber: 2, roundPosition: 1 });
  expect(targetMatchUp.drawPositions.filter(Boolean)).toEqual([1]);
  expect(targetMatchUp.matchUpStatus).toEqual(WALKOVER);
  expect(targetMatchUp.winningSide).toEqual(1);
});
