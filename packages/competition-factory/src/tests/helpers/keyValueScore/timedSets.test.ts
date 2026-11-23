import { keyValueMatchUpScore } from '@Helpers/keyValueScore/keyValueScore';
import { enterValues } from './primitives';
import { expect, it } from 'vitest';

const TIMED3x10 = 'SET3-S:T10';

it('can enter single timed set', () => {
  const matchUpFormat = 'SET1-S:T10';
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({ value: 2, matchUp, matchUpFormat }));
  expect(matchUp?.scoreString.trim()).toEqual('2');
  expect(matchUp?.sets).toEqual([
    {
      setNumber: 1,
      side1Score: 2,
      side2Score: undefined,
      winningSide: undefined,
    },
  ]);
  expect(matchUp?.sets[0].winningSide).toEqual(undefined);
});

it('can enter best of three timed sets', () => {
  const matchUpFormat = TIMED3x10;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { value: 3 },
    { value: '-' },
    { value: 2 },
    { value: 'space' },
    { value: 2 },
    { value: '-' },
    { value: 3 },
    { value: 'space' },
    { value: 3 },
    { value: '-' },
    { value: 2 },
    { value: 'space' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp?.scoreString.trim()).toEqual('3-2 2-3 3-2');
  expect(matchUp?.winningSide).toEqual(1);
});

it('supports adding outcomes', () => {
  const matchUpFormat = TIMED3x10;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [{ value: 3 }, { value: '-' }, { value: 2 }, { lowSide: 2, value: 'r' }];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp?.scoreString.trim()).toEqual('3-2 RET');
  expect(matchUp?.winningSide).toEqual(1);
});
it('can handle adding and removing outcome', () => {
  const matchUpFormat = TIMED3x10;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { value: 3 },
    { value: '-' },
    { value: 2 },
    { value: 'r' },
    { value: 'backspace' },
    { value: 'space' },
    { value: 2 },
    { value: '-' },
    { value: 3 },
    { value: 'space' },
    { value: 3 },
    { value: '-' },
    { value: 2 },
    { value: 'space' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp?.scoreString.trim()).toEqual('3-2 2-3 3-2');
  expect(matchUp?.winningSide).toEqual(1);
});

it('does not consider tied scoreString to be complete set', () => {
  const matchUpFormat = TIMED3x10;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { value: 3 },
    { value: '-' },
    { value: 3 },
    { value: 'space' },
    { value: 2 },
    { value: '-' },
    { value: 3 },
    { value: 'space' },
    { value: 3 },
    { value: '-' },
    { value: 2 },
    { value: 'space' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp?.scoreString.trim()).toEqual('3-32 3-2');
  expect(matchUp?.winningSide).toEqual(undefined);
});

it('handles zeros properly', () => {
  const matchUpFormat = TIMED3x10;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { value: 0 },
    { value: '-' },
    { value: 1 },
    { value: 'space' },
    { value: 1 },
    { value: '-' },
    { value: 0 },
    { value: 'space' },
    { value: 0 },
    { value: '-' },
    { value: 0 },
    { value: 'space' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp?.scoreString.trim()).toEqual('0-1 1-0 0-0');
  expect(matchUp?.winningSide).toEqual(undefined);
});

it('ignores leading zeroes', () => {
  const matchUpFormat = TIMED3x10;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { value: 0 },
    { value: 1 },
    { value: '-' },
    { value: 2 },
    { value: 'space' },
    { value: 0 },
    { value: 2 },
    { value: '-' },
    { value: 0 },
    { value: 'space' },
    { value: 0 },
    { value: 1 },
    { value: '-' },
    { value: 0 },
    { value: 3 },
    { value: 'space' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp?.scoreString.trim()).toEqual('1-2 2-0 1-3');
  expect(matchUp?.winningSide).toEqual(2);
});
