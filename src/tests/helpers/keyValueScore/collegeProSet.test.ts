import { enterValues } from './primitives';
import { it, expect } from 'vitest';

// Fixtures
import { FORMAT_COLLEGE_PRO_SET } from '@Fixtures/scoring/matchUpFormats';

it('support best of five sets with NO ADVANTAGE in Games', () => {
  const matchUpFormat = FORMAT_COLLEGE_PRO_SET;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [{ lowSide: 2, value: '3' }];

  matchUp = enterValues({ values, matchUp }).matchUp;
  expect(matchUp.scoreString.trim()).toEqual('8-3');

  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toEqual(1);
});
