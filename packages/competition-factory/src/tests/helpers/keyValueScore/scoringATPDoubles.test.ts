import { TIEBREAK_CLOSER, scoreMatchUp, enterValues } from './primitives';
import { expect, it } from 'vitest';

// constants and fixtures
import { FORMAT_ATP_DOUBLES } from '@Fixtures/scoring/matchUpFormats';
import { MATCH_TIEBREAK_JOINER } from '@Constants/keyValueConstants';

it('recognizes incomplete matchUp tiebreaks', () => {
  let info;
  const matchUpFormat = FORMAT_ATP_DOUBLES;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const v1 = [
    { lowSide: 2, value: 3 },
    { lowSide: 1, value: 3 },
    { lowSide: 2, value: 3 },
  ];

  ({ matchUp } = enterValues({ values: v1, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-3 3-6 [10${MATCH_TIEBREAK_JOINER}3`);
  expect(matchUp.score?.sets.length).toEqual(3);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-3 3-6 [10`);
  expect(matchUp.score?.sets.length).toEqual(3);

  // not valid to complete scoreString
  ({ matchUp, info } = scoreMatchUp({ value: ']', matchUp }));
  expect(info).not.toBeUndefined();
  expect(matchUp.scoreString.trim()).toEqual(`6-3 3-6 [10`);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-3 3-6 [1`);
  expect(matchUp.score?.sets.length).toEqual(3);

  // not valid to complete scoreString
  ({ matchUp, info } = scoreMatchUp({ value: ']', matchUp }));
  expect(info).not.toBeUndefined();
  expect(matchUp.scoreString.trim()).toEqual(`6-3 3-6 [1`);

  ({ matchUp } = scoreMatchUp({ value: '1', lowSide: 1, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-3 3-6 [11${MATCH_TIEBREAK_JOINER}13`);

  ({ matchUp } = scoreMatchUp({ value: ']', matchUp }));
  expect(matchUp.winningSide).toEqual(2);
});

it('can support 2nd set tiebreaks with 3rd set matchUp tiebreaks', () => {
  const matchUpFormat = FORMAT_ATP_DOUBLES;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const v1 = [{ lowSide: 2, value: '3' }, { lowSide: 1, value: '6' }, { lowSide: 2, value: '2' }, TIEBREAK_CLOSER];

  ({ matchUp } = enterValues({ values: v1, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('6-3 6-7(2)');
  expect(matchUp.score?.sets.length).toEqual(2);

  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '3', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-3 6-7(2) [10${MATCH_TIEBREAK_JOINER}3`);
  expect(matchUp.score?.sets.length).toEqual(3);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ value: ']', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-3 6-7(2) [10${MATCH_TIEBREAK_JOINER}3]`);
  expect(matchUp.winningSide).toEqual(1);
});

it('does not allow matchUp tiebreak scores greater than 2 digits', () => {
  const matchUpFormat = FORMAT_ATP_DOUBLES;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: '3' },
    { lowSide: 1, value: '3' },
    { lowSide: 2, value: '3' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-3 3-6 [10${MATCH_TIEBREAK_JOINER}3`);
  expect(matchUp.score?.sets.length).toEqual(3);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ lowSide: 1, value: '1', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-3 3-6 [10${MATCH_TIEBREAK_JOINER}3`);
  expect(matchUp.winningSide).toBeUndefined();
});

it('can enter 0 for side 2 when matchUp tiebreak open bracket and no matchUp tiebreak scoreString', () => {
  const matchUpFormat = FORMAT_ATP_DOUBLES;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: '3' },
    { lowSide: 1, value: '3' },
    { lowSide: 2, value: '3' },
    { value: 'backspace' },
    { value: 'backspace' },
    { value: 'backspace' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-3 3-6`);
  expect(matchUp.score?.sets.length).toEqual(2);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '0', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`6-3 3-6 [10${MATCH_TIEBREAK_JOINER}0`);
  expect(matchUp.winningSide).toBeUndefined();
});
