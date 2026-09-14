import { matchUpScore } from '@Assemblies/generators/matchUps/matchUpScore';
import { expect, it } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

it('can generate score object', () => {
  const sets = [
    { setNumber: 1, side1Score: 6, side2Score: 2, winningSide: 1 },
    { setNumber: 2, side1Score: 1, side2Score: 6, winningSide: 2 },
    { setNumber: 3, side1Score: 1, side2Score: 6, winningSide: 2 },
  ];
  const { score } = matchUpScore({
    score: { sets },
    winningSide: 2,
    matchUpStatus: COMPLETED,
  });

  expect(score?.scoreStringSide1).toEqual('6-2 1-6 1-6');
  expect(score?.scoreStringSide2).toEqual('2-6 6-1 6-1');
});

it('generates correct scoreStrings for tiebreak sets', () => {
  const sets = [
    {
      setNumber: 1,
      side1TiebreakScore: 6,
      side2TiebreakScore: 8,
      winningSide: 2,
    },
    {
      setNumber: 2,
      side1TiebreakScore: 6,
      side2TiebreakScore: 8,
      winningSide: 2,
    },
  ];
  const { score } = matchUpScore({
    score: { sets },
    winningSide: 2,
    matchUpStatus: COMPLETED,
  });

  expect(score).toEqual({
    sets: [
      {
        setNumber: 1,
        side1TiebreakScore: 6,
        side2TiebreakScore: 8,
        winningSide: 2,
      },
      {
        setNumber: 2,
        side1TiebreakScore: 6,
        side2TiebreakScore: 8,
        winningSide: 2,
      },
    ],
    scoreStringSide1: '[6-8] [6-8]',
    scoreStringSide2: '[8-6] [8-6]',
  });
});
