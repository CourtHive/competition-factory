import { TIEBREAK_CLOSER, scoreMatchUp, enterValues } from './primitives';
import { singleSetStressTests } from './standardStress';
import { expect, it } from 'vitest';

const FORMAT_NOAD_SET_TIEBREAK = 'SET1-S:6/TB7NOAD';
const FORMAT_BEST_OF_3_MATCH_TB7 = 'SET3-S:TB7';
const FORMAT_BEST_OF_3_MATCH_TB10 = 'SET3-S:TB10';

singleSetStressTests({ matchUpFormat: FORMAT_NOAD_SET_TIEBREAK, setTo: 6 });

it('handles set tiebreak with NoAD', () => {
  const matchUpFormat = FORMAT_NOAD_SET_TIEBREAK;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [{ lowSide: 2, value: '6' }, { lowSide: 2, value: '7' }, { lowSide: 2, value: '6' }, TIEBREAK_CLOSER];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`7-6(6)`);
  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toEqual(1);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '6', matchUp }));
  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '9', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`7-6(6`);
  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toBeUndefined();
});

it('handles best of 3 matchUp tiebreaks to 7', () => {
  const matchUpFormat = FORMAT_BEST_OF_3_MATCH_TB7;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: '3' },
    { value: 'space' },
    { lowSide: 1, value: '3' },
    { value: 'space' },
    { lowSide: 2, value: '3' },
    { value: 'space' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`[7-3] [3-7] [7-3]`);
  expect(matchUp.score?.sets.length).toEqual(3);
  expect(matchUp.winningSide).toEqual(1);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`[7-3] [3-7] [7-`);
  expect(matchUp.score?.sets.length).toEqual(3);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`[7-3] [3-7]`);
  expect(matchUp.score?.sets.length).toEqual(2);
  expect(matchUp.winningSide).toBeUndefined();
});

it('handles best of 3 matchUp tiebreaks to 10', () => {
  const matchUpFormat = FORMAT_BEST_OF_3_MATCH_TB10;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: '3' },
    { value: 'space' },
    { lowSide: 1, value: '3' },
    { value: 'space' },
    { lowSide: 2, value: '3' },
    { value: 'space' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`[10-3] [3-10] [10-3]`);
  expect(matchUp.score?.sets.length).toEqual(3);
  expect(matchUp.winningSide).toEqual(1);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`[10-3] [3-10] [10-`);
  expect(matchUp.score?.sets.length).toEqual(3);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`[10-3] [3-10] [1`);
  expect(matchUp.score?.sets.length).toEqual(3);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`[10-3] [3-10]`);
  expect(matchUp.score?.sets.length).toEqual(2);
  expect(matchUp.winningSide).toBeUndefined();
});
