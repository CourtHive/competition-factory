import { reverseScore } from '@Assemblies/generators/score/reverseScore';
import { expect, it } from 'vitest';

// constants
import { MISSING_VALUE } from '@Constants/errorConditionConstants';

it('can reverse score objects and regenerate scoreStrings', () => {
  const { error } = reverseScore();
  expect(error).toEqual(MISSING_VALUE);

  const score = {
    sets: [
      {
        side1Score: 6,
        side2Score: 4,
        winningSide: 1,
        setNumber: 1,
      },
      {
        side1Score: 6,
        side2Score: 2,
        winningSide: 1,
        setNumber: 2,
      },
    ],
    scoreStringSide1: '6-4 6-2',
  };

  const { reversedScore } = reverseScore({
    score,
  });
  expect(reversedScore).toEqual({
    sets: [
      { winningSide: 2, side1Score: 4, side2Score: 6, setNumber: 1 },
      { winningSide: 2, side1Score: 2, side2Score: 6, setNumber: 2 },
    ],
    scoreStringSide1: '4-6 2-6',
    scoreStringSide2: '6-4 6-2',
  });
});

it('can reverse tiebreak sets and regenerate scoreStrings', () => {
  const score = {
    sets: [
      {
        side1Score: 5,
        side2Score: 7,
        winningSide: 2,
        setNumber: 1,
      },
      {
        side1Score: 6,
        side2Score: 2,
        winningSide: 1,
        setNumber: 2,
      },
      {
        side1TiebreakScore: 12,
        side2TiebreakScore: 10,
        winningSide: 1,
        setNumber: 3,
      },
    ],
  };

  const { reversedScore } = reverseScore({
    score,
  });
  expect(reversedScore).toEqual({
    sets: [
      { winningSide: 1, side1Score: 7, side2Score: 5, setNumber: 1 },
      { winningSide: 2, side1Score: 2, side2Score: 6, setNumber: 2 },
      {
        winningSide: 2,
        side1TiebreakScore: 10,
        side2TiebreakScore: 12,
        setNumber: 3,
      },
    ],
    scoreStringSide1: '7-5 2-6 [10-12]',
    scoreStringSide2: '5-7 6-2 [12-10]',
  });
});
