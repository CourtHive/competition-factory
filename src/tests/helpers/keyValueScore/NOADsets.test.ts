import { enterValues, scoreMatchUp } from './primitives';
import { expect, it } from 'vitest';

// Fixtures
import { FORMAT_STANDARD_NOAD } from '@Fixtures/scoring/matchUpFormats';

it('handles set scoring with NoAD', () => {
  const matchUpFormat = FORMAT_STANDARD_NOAD;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: '5' },
    { lowSide: 2, value: '5' },
  ];
  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-5 6-5`);

  expect(matchUp.score?.sets.length).toEqual(2);
  expect(matchUp.winningSide).toEqual(1);
});

it('handles set scoring with NoAD when incomplete score', () => {
  const matchUpFormat = FORMAT_STANDARD_NOAD;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [{ lowSide: 2, value: '5' }];
  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-5`);
  expect(matchUp.score.sets[0].winningSide).toEqual(1);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-`);
  expect(matchUp.score.sets[0].winningSide).toBeUndefined();
  ({ matchUp } = scoreMatchUp({ value: '6', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-`);
  expect(matchUp.score.sets[0].winningSide).toBeUndefined();
  ({ matchUp } = scoreMatchUp({ value: '2', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-2`);
  expect(matchUp.score.sets[0].winningSide).toEqual(1);
});

it('handles set scoring with NoAD when incomplete score and low score on side1 is setTo - 1', () => {
  const matchUpFormat = FORMAT_STANDARD_NOAD;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [{ lowSide: 1, value: '5' }];
  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`5-6`);
  expect(matchUp.score.sets[0].winningSide).toEqual(2);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`5-`);
  expect(matchUp.winningSide).toBeUndefined();
  ({ matchUp } = scoreMatchUp({ value: '6', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`5-6`);
  expect(matchUp.score.sets[0].winningSide).toEqual(2);
  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`5-`);
  expect(matchUp.winningSide).toBeUndefined();
  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '7', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`5-`);
  expect(matchUp.winningSide).toBeUndefined();
});
