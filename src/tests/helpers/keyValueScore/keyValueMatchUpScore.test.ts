import { keyValueMatchUpScore } from '@Helpers/keyValueScore/keyValueScore';
import { expect, it } from 'vitest';

// fixtures
import { FORMAT_STANDARD, FORMAT_ATP_DOUBLES } from '@Fixtures/scoring/matchUpFormats';

function scoreMatchUp(params) {
  const { lowSide, value } = params;
  let matchUp = params.matchUp;
  let info;
  ({ matchUp, info } = keyValueMatchUpScore({ lowSide, value, matchUp }));
  return { matchUp, info };
}

function enterValues({ values, matchUp }) {
  let info;
  const messages: any[] = [];
  values.forEach((item) => {
    const { lowSide, value } = item;
    ({ matchUp, info } = scoreMatchUp({ lowSide, value, matchUp }));
    if (info) messages.push(info);
  });
  return { matchUp, messages };
}

it('can enter a straight set win for side 1 or side 2', () => {
  let updated;
  const matchUpFormat = FORMAT_STANDARD;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 3,
    matchUp,
    matchUpFormat,
  }));

  expect(matchUp?.scoreString.trim()).toEqual('6-3');
  expect(matchUp?.sets).toMatchObject([{ side1Score: 6, side2Score: 3, winningSide: 1 }]);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.scoreString.trim()).toEqual('6-3 6-2');
  expect(matchUp?.sets.length).toEqual(2);

  ({ updated } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(updated).toEqual(false);

  matchUp = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 1,
    value: 3,
    matchUp,
    matchUpFormat,
  }));

  expect(matchUp?.scoreString.trim()).toEqual('3-6');
  expect(matchUp?.sets).toMatchObject([{ side1Score: 3, side2Score: 6, winningSide: 2 }]);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.scoreString.trim()).toEqual('3-6 2-6');
  expect(matchUp?.sets.length).toEqual(2);

  ({ updated } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(updated).toEqual(false);
});

it('can enter a three set win for either side', () => {
  let updated;
  const matchUpFormat = FORMAT_STANDARD;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 1,
    value: 4,
    matchUp,
    matchUpFormat,
  }));

  expect(matchUp?.scoreString.trim()).toEqual('4-6');
  expect(matchUp?.sets).toMatchObject([{ side1Score: 4, side2Score: 6, winningSide: 2 }]);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.scoreString.trim()).toEqual('4-6 6-2');
  expect(matchUp?.sets.length).toEqual(2);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 1,
    value: 1,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.scoreString.trim()).toEqual('4-6 6-2 1-6');
  expect(matchUp?.sets.length).toEqual(3);

  ({ updated } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(updated).toEqual(false);

  matchUp = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 1,
    value: 4,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.scoreString.trim()).toEqual('4-6');
  expect(matchUp?.sets).toMatchObject([{ side1Score: 4, side2Score: 6, winningSide: 2 }]);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.scoreString.trim()).toEqual('4-6 6-2');
  expect(matchUp?.sets.length).toEqual(2);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 1,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.scoreString.trim()).toEqual('4-6 6-2 6-1');
  expect(matchUp?.sets.length).toEqual(3);

  ({ updated } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(updated).toEqual(false);
});

it('can enter a first set tiebreak scoreString', () => {
  const matchUpFormat = FORMAT_STANDARD;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 6,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.scoreString.trim()).toEqual('7-6(');
  expect(matchUp?.sets).toMatchObject([{ side1Score: 7, side2Score: 6, winningSide: undefined }]);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.scoreString.trim()).toEqual('7-6(2');
  expect(matchUp?.sets.length).toEqual(1);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 'space',
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.scoreString.trim()).toEqual('7-6(2)');
  expect(matchUp?.sets.length).toEqual(1);
  expect(matchUp?.winningSide).toEqual(undefined);
});

it('can handle scoreString deletions', () => {
  const matchUpFormat = FORMAT_STANDARD;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const v1 = [{ lowSide: 2, value: 3 }, { lowSide: 2, value: 6 }, { lowSide: 2, value: 2 }, { value: 'space' }];

  ({ matchUp } = enterValues({ values: v1, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('6-3 7-6(2)');

  matchUp = { scoreString: undefined, sets: [], matchUpFormat };

  const v2 = [
    { lowSide: 2, value: 3 },
    { lowSide: 2, value: 6 },
    { lowSide: 2, value: 2 },
    { value: 'backspace' },
    { value: 'backspace' },
    { lowSide: 2, value: 5 },
  ];

  ({ matchUp } = enterValues({ values: v2, matchUp }));
  // test that tiebreak can be converted into win by 2 with scoreString = setTo + 1
  expect(matchUp.scoreString.trim()).toEqual('6-3 7-5');
});

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
  expect(matchUp.scoreString.trim()).toEqual('6-3 3-6 [10-3');
  expect(matchUp.score?.sets.length).toEqual(3);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('6-3 3-6 [10');
  expect(matchUp.score?.sets.length).toEqual(3);

  // not valid to complete scoreString
  ({ matchUp, info } = scoreMatchUp({ value: ']', matchUp }));
  expect(info).not.toBeUndefined();
  expect(matchUp.scoreString.trim()).toEqual('6-3 3-6 [10');

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('6-3 3-6 [1');
  expect(matchUp.score?.sets.length).toEqual(3);

  // not valid to complete scoreString
  ({ matchUp, info } = scoreMatchUp({ value: ']', matchUp }));
  expect(info).not.toBeUndefined();
  expect(matchUp.scoreString.trim()).toEqual('6-3 3-6 [1');

  ({ matchUp } = scoreMatchUp({ value: '1', lowSide: 1, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('6-3 3-6 [11-13');

  ({ matchUp } = scoreMatchUp({ value: ']', matchUp }));
  expect(matchUp.winningSide).toEqual(2);
});

it('can support 2nd set tiebreaks with 3rd set matchUp tiebreaks', () => {
  const matchUpFormat = FORMAT_ATP_DOUBLES;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const v1 = [{ lowSide: 2, value: '3' }, { lowSide: 1, value: '6' }, { lowSide: 2, value: '2' }, { value: 'space' }];

  ({ matchUp } = enterValues({ values: v1, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('6-3 6-7(2)');
  expect(matchUp.score?.sets.length).toEqual(2);

  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '3', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('6-3 6-7(2) [10-3');
  expect(matchUp.score?.sets.length).toEqual(3);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ value: ']', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('6-3 6-7(2) [10-3]');
  expect(matchUp.winningSide).toEqual(1);
});
