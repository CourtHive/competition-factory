import { keyValueScore } from '@Helpers/keyValueScore/keyValueScore';
import { expect, it } from 'vitest';

// constants and fixtures
import { INCOMPLETE, TO_BE_PLAYED } from '@Constants/matchUpStatusConstants';
import { FORMAT_STANDARD, TIMED20 } from '@Fixtures/scoring/matchUpFormats';
import { OUTCOME_COMPLETE } from '@Constants/keyValueConstants';

function enterKeyValues(params) {
  const { matchUpFormat, shiftFirst, valuePairs } = params;
  let { matchUpStatus, scoreString, sets } = params;

  let updated, winningSide;

  valuePairs.forEach((valuePair) => {
    const { value, lowSide = 2 } = valuePair;
    ({ updated, sets, scoreString, winningSide, matchUpStatus } = keyValueScore({
      value,
      lowSide,

      sets,
      scoreString,
      matchUpStatus,
      matchUpFormat,
      shiftFirst,
    }));
  });

  return {
    updated,
    sets,
    scoreString,
    matchUpStatus,
    winningSide,
    matchUpFormat,
  };
}

it('can modify scoreString string', () => {
  const { updated, scoreString: updatedScore } = keyValueScore({
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: '',
    scoreString: '',
    lowSide: 2,
    value: '0',
    sets: [],
  });

  expect(updated).toEqual(true);
  expect(updatedScore).toEqual('6-0 ');
});

it('can use valuePairs', () => {
  const valuePairs = [
    { lowSide: 1, value: '0' },
    { lowSide: 1, value: '0' },
  ];

  const result = enterKeyValues({
    matchUpFormat: FORMAT_STANDARD,
    shiftFirst: false,
    scoreString: '',
    valuePairs,
    sets: [],
  });

  expect(result.scoreString).toEqual('0-6 0-6 ');
});

it('can shiftFirst', () => {
  const valuePairs = [
    { lowSide: 2, value: '0' },
    { lowSide: 2, value: '0' },
  ];

  const result = enterKeyValues({
    matchUpFormat: FORMAT_STANDARD,
    shiftFirst: true,
    scoreString: '',
    valuePairs,
    sets: [],
  });

  expect(result.scoreString).toEqual('0-6 0-6 ');
});

it('can delete values', () => {
  const valuePairs = [
    { lowSide: 1, value: '0' },
    { lowSide: 1, value: '0' },
    { lowSide: 1, value: 'backspace' },
  ];

  const result = enterKeyValues({
    sets: [],
    scoreString: '',
    matchUpFormat: FORMAT_STANDARD,
    valuePairs,
    shiftFirst: false,
  });

  expect(result.scoreString).toEqual('0-6 0-');

  const nextResult = enterKeyValues({
    ...result,
    valuePairs: [{ lowSide: 1, value: '6' }],
    shiftFirst: false,
  });

  expect(nextResult.scoreString.trim()).toEqual('0-6 0-6');
});

it('can complete existing scoreString', () => {
  const valuePairs = [{ lowSide: 2, value: '0' }];

  const result = enterKeyValues({
    sets: [
      {
        setNumber: 1,
        side1Score: 7,
        side1TiebreakScore: 7,
        side2Score: 6,
        side2TiebreakScore: 3,
        winningSide: 1,
      },
    ],
    scoreString: '7-6(3)',
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: INCOMPLETE,
    valuePairs,
    shiftFirst: false,
  });

  expect(result.matchUpStatus).toEqual(OUTCOME_COMPLETE);
});

it('can complete timed scores', () => {
  const valuePairs = [
    { lowSide: 2, value: '0' },
    { lowSide: 2, value: '-' },
    { lowSide: 2, value: '8' },
  ];

  const result = enterKeyValues({
    sets: [],
    scoreString: undefined,
    matchUpFormat: TIMED20,
    matchUpStatus: TO_BE_PLAYED,
    valuePairs,
    shiftFirst: false,
  });

  expect(result.scoreString).toEqual('0-8');
});

it('can properly backspace in timed sets', () => {
  const valuePairs = [
    { lowSide: 2, value: '1' },
    { lowSide: 2, value: '-' },
    { lowSide: 2, value: '1' },
  ];

  const result = enterKeyValues({
    sets: [],
    scoreString: undefined,
    matchUpFormat: TIMED20,
    matchUpStatus: TO_BE_PLAYED,
    valuePairs,
    shiftFirst: false,
  });

  expect(result.scoreString).toEqual('1-1');

  const nextResult = enterKeyValues({
    ...result,
    valuePairs: [
      { lowSide: 1, value: 'backspace' },
      { lowSide: 1, value: '8' },
    ],
    shiftFirst: false,
  });

  expect(nextResult.scoreString.trim()).toEqual('1-8');
});

it('can properly backspace in timed sets', () => {
  const valuePairs = [
    { lowSide: 2, value: '0' },
    { lowSide: 2, value: '-' },
    { lowSide: 2, value: '0' },
  ];

  const result = enterKeyValues({
    sets: [],
    scoreString: undefined,
    matchUpFormat: TIMED20,
    matchUpStatus: TO_BE_PLAYED,
    valuePairs,
    shiftFirst: false,
  });

  expect(result.scoreString).toEqual('0-0');

  const nextResult = enterKeyValues({
    ...result,
    valuePairs: [
      { lowSide: 1, value: 'backspace' },
      { lowSide: 1, value: '8' },
    ],
    shiftFirst: false,
  });

  expect(nextResult.scoreString.trim()).toEqual('0-8');
});
