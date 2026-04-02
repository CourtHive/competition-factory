import { submitScoreChange } from '../submitScoreChange';
import { expect, test } from 'vitest';

import { FORMAT_STANDARD } from '@Fixtures/scoring/matchUpFormats';
import {
  MISSING_VALUE,
  MISSING_MATCHUP,
  INVALID_SET_NUMBER,
  MISSING_SET_NUMBER,
  MISSING_SIDE_NUMBER,
  INVALID_SIDE_NUMBER,
} from '@Constants/errorConditionConstants';

test('submitScoreChange smoke test', () => {
  const matchUp = {
    score: {
      sets: [
        { setNumber: 1, side1Score: 6, side2Score: 3, winningSide: 1 },
        { setNumber: 2, side1Score: 3, side2Score: 6, winningSide: 2 },
        {
          setNumber: 3,
          side1Score: 7,
          side2Score: 6,
          side1TiebreakScore: 7,
          side2TiebreakScore: 3,
          winningSide: 1,
        },
      ],
    },
    winningSide: 1,
    matchUpFormat: FORMAT_STANDARD,
  };

  let { result, error } = submitScoreChange();
  expect(result).toEqual(false);
  expect(error).toEqual(MISSING_MATCHUP);

  ({ result, error } = submitScoreChange({ matchUp }));
  expect(result).toEqual(false);
  expect(error).toEqual(MISSING_SIDE_NUMBER);

  ({ result, error } = submitScoreChange({ matchUp, sideNumber: 2 }));
  expect(result).toEqual(false);
  expect(error).toEqual(MISSING_SET_NUMBER);

  ({ result, error } = submitScoreChange({
    matchUp,
    sideNumber: 2,
    setNumber: 3,
  }));
  expect(result).toEqual(false);
  expect(error).toEqual(MISSING_VALUE);

  ({ result, error } = submitScoreChange({
    matchUp,
    sideNumber: 3,
    setNumber: 3,
    value: 2,
  }));
  expect(result).toEqual(false);
  expect(error).toEqual(INVALID_SIDE_NUMBER);

  ({ result, error } = submitScoreChange({
    matchUp,
    sideNumber: 2,
    setNumber: 3,
    value: 2,
  }));
  expect(result).toEqual(false);
  expect(error).toEqual(INVALID_SET_NUMBER);

  ({ result } = submitScoreChange({
    matchUp,
    sideNumber: 1,
    setNumber: 3,
    value: 6,
  }));
  expect(result).toEqual(true);

  /*
  ({ result, error } = submitScoreChange({
    matchUp,
    sideNumber: 1,
    setNumber: 3,
    value: 4,
  }));
  console.log(result, error);
  */
});
