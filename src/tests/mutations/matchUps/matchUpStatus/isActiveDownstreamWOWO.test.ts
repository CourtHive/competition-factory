import mocksEngine from '@Assemblies/engines/mock';
import tournamentEngine from '@Engines/syncEngine';
import { expect, it } from 'vitest';

// constants
import { DOUBLE_WALKOVER } from '@Constants/matchUpStatusConstants';
import { SCORE } from '@Constants/matchUpActionConstants';

const getTarget = ({ matchUps, roundNumber, roundPosition }) =>
  matchUps.find((matchUp) => matchUp.roundNumber === roundNumber && matchUp.roundPosition === roundPosition);

it('can recognize when double WO/WO propagated WO/WO is NOT active downstream', () => {
  const drawSize = 16;
  const drawProfiles = [
    {
      drawSize,
      outcomes: [
        {
          matchUpStatus: DOUBLE_WALKOVER,
          roundPosition: 1,
          roundNumber: 1,
        },
        {
          matchUpStatus: DOUBLE_WALKOVER,
          roundPosition: 2,
          roundNumber: 1,
        },
        {
          matchUpStatus: DOUBLE_WALKOVER,
          roundPosition: 3,
          roundNumber: 1,
        },
      ],
    },
  ];

  let result = mocksEngine.generateTournamentRecord({
    drawProfiles,
  });

  result = tournamentEngine.setState(result.tournamentRecord);
  expect(result.success).toEqual(true);

  const { completedMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(
    completedMatchUps.map(({ matchUpStatus, roundNumber, roundPosition }) => [
      matchUpStatus,
      roundNumber,
      roundPosition,
    ]),
  ).toEqual([
    ['DOUBLE_WALKOVER', 1, 1], // { roundNumber: 1, roundPosition: 1 }
    ['DOUBLE_WALKOVER', 1, 2],
    ['DOUBLE_WALKOVER', 1, 3],
    ['DOUBLE_WALKOVER', 2, 1],
    ['WALKOVER', 2, 2],
    ['WALKOVER', 3, 1],
  ]);
  expect(completedMatchUps.length).toEqual(6);

  let matchUp = getTarget({
    matchUps: completedMatchUps,
    roundPosition: 3,
    roundNumber: 1,
  });
  expect(matchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  let { validActions } = tournamentEngine.matchUpActions(matchUp);
  let types = validActions.reduce(
    (types, action) => (types.includes(action.type) ? types : types.concat(action.type)),
    [],
  );
  expect(types.includes(SCORE)).toEqual(true);

  matchUp = getTarget({
    matchUps: completedMatchUps,
    roundPosition: 1,
    roundNumber: 1,
  });
  expect(matchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  ({ validActions } = tournamentEngine.matchUpActions(matchUp));
  types = validActions.reduce((types, action) => (types.includes(action.type) ? types : types.concat(action.type)), []);
  expect(types.includes(SCORE)).toEqual(true);
});

it('can recognize when double WO/WO propagated WO/WO is active downstream', () => {
  const drawSize = 16;
  const drawProfiles = [
    {
      drawSize,
      outcomes: [
        {
          matchUpStatus: DOUBLE_WALKOVER,
          roundPosition: 1,
          roundNumber: 1,
        },
        {
          matchUpStatus: DOUBLE_WALKOVER,
          roundPosition: 2,
          roundNumber: 1,
        },
        {
          matchUpStatus: DOUBLE_WALKOVER,
          roundPosition: 3,
          roundNumber: 1,
        },
      ],
    },
  ];

  let result = mocksEngine.generateTournamentRecord({
    completeAllMatchUps: true,
    drawProfiles,
  });

  result = tournamentEngine.setState(result.tournamentRecord);
  expect(result.success).toEqual(true);

  const { completedMatchUps } = tournamentEngine.tournamentMatchUps();
  expect(completedMatchUps.length).toEqual(drawSize - 1);

  let matchUp = getTarget({
    matchUps: completedMatchUps,
    roundPosition: 3,
    roundNumber: 1,
  });
  expect(matchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  let { validActions } = tournamentEngine.matchUpActions(matchUp);
  let types = validActions.reduce(
    (types, action) => (types.includes(action.type) ? types : types.concat(action.type)),
    [],
  );
  expect(types.includes(SCORE)).toEqual(false);

  matchUp = getTarget({
    matchUps: completedMatchUps,
    roundPosition: 1,
    roundNumber: 1,
  });
  expect(matchUp.matchUpStatus).toEqual(DOUBLE_WALKOVER);

  ({ validActions } = tournamentEngine.matchUpActions(matchUp));
  types = validActions.reduce((types, action) => (types.includes(action.type) ? types : types.concat(action.type)), []);
  expect(types.includes(SCORE)).toEqual(false);
});
