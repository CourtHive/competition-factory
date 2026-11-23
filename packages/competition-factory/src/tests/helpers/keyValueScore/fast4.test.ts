import { keyValueMatchUpScore } from '@Helpers/keyValueScore/keyValueScore';
import { stressTests } from './standardStress';
import { expect, it } from 'vitest';

// fixtures and primitives
import { TIEBREAK_CLOSER, scoreMatchUp, enterValues } from './primitives';
import { FORMAT_FAST4 } from '@Fixtures/scoring/matchUpFormats';

/*
  NOTE:
    TIEBREAK_CLOSER must be used instead of { value: ')' }
    ...because value passed into keyValueMatchUpScore from HotDiv is { lowSide: 2, value: '0' }
*/

stressTests({ matchUpFormat: FORMAT_FAST4, setTo: 4 });

it('can enter a straight set win for side 1', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  }));

  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('4-2');
  expect(matchUp?.score?.sets).toMatchObject([{ side1Score: 4, side2Score: 2, winningSide: 1 }]);
  expect(matchUp?.score?.sets[0].winningSide).toEqual(1);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('4-2 4-2');
  expect(matchUp?.score?.sets.length).toEqual(2);
  expect(matchUp?.score?.sets[1].winningSide).toEqual(1);
  expect(matchUp?.winningSide).toEqual(1);

  // entering a value after winningSide is determined does nothing
  const { info, updated } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  });
  expect(updated).toEqual(false);
  expect(info).toEqual('matchUp is complete');
});

it('can enter a straight set win for side 2', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  }));

  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('2-4');
  expect(matchUp?.score?.sets).toMatchObject([{ side1Score: 2, side2Score: 4, winningSide: 2 }]);
  expect(matchUp?.score?.sets[0].winningSide).toEqual(2);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('2-4 2-4');
  expect(matchUp?.score?.sets.length).toEqual(2);
  expect(matchUp?.score?.sets[1].winningSide).toEqual(2);
  expect(matchUp?.winningSide).toEqual(2);

  // entering a value after winningSide is determined does nothing
  const { info, updated } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  });
  expect(updated).toEqual(false);
  expect(info).toEqual('matchUp is complete');
});

it('can enter a three set win for side 1', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  }));

  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('2-4');
  expect(matchUp?.score?.sets).toMatchObject([{ side1Score: 2, side2Score: 4, winningSide: 2 }]);
  expect(matchUp?.score?.sets[0].winningSide).toEqual(2);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('2-4 4-2');
  expect(matchUp?.score?.sets.length).toEqual(2);
  expect(matchUp?.score?.sets[1].winningSide).toEqual(1);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 1,
    value: 1,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('2-4 4-2 1-4');
  expect(matchUp?.score?.sets.length).toEqual(3);
  expect(matchUp?.score?.sets[2].winningSide).toEqual(2);
  expect(matchUp?.winningSide).toEqual(2);

  const { updated } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  });
  expect(updated).toEqual(false);
});

it('can enter a three set win for side 2', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('2-4');
  expect(matchUp?.score?.sets).toMatchObject([{ side1Score: 2, side2Score: 4, winningSide: 2 }]);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('2-4 4-2');
  expect(matchUp?.score?.sets.length).toEqual(2);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 1,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('2-4 4-2 4-1');
  expect(matchUp?.score?.sets.length).toEqual(3);
  expect(matchUp?.winningSide).toEqual(1);

  const { updated } = keyValueMatchUpScore({
    lowSide: 1,
    value: 2,
    matchUp,
    matchUpFormat,
  });
  expect(updated).toEqual(false);
});

it('does not accept setTo as valid value since tiebreakAt < setTo', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 4,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1 || undefined).toBeUndefined();
});

it('can enter a first set tiebreak scoreString', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 3,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('4-3(');
  expect(matchUp?.score?.sets).toMatchObject([{ side1Score: 4, side2Score: 3, winningSide: undefined }]);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 2,
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('4-3(2');
  expect(matchUp?.score?.sets.length).toEqual(1);

  ({ matchUp } = keyValueMatchUpScore({
    lowSide: 2,
    value: 'space',
    matchUp,
    matchUpFormat,
  }));
  expect(matchUp?.score?.scoreStringSide1.trim()).toEqual('4-3(2)');
  expect(matchUp?.score?.sets.length).toEqual(1);

  expect(matchUp?.score?.sets[0].winningSide).toEqual(1);
  expect(matchUp?.winningSide).toEqual(undefined);
});

it('can enter a second set tiebreak scoreString', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [{ lowSide: 2, value: 1 }, { lowSide: 2, value: 3 }, { lowSide: 2, value: 2 }, TIEBREAK_CLOSER];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('4-1 4-3(2)');
  expect(matchUp?.score?.sets[0].winningSide).toEqual(1);
  expect(matchUp?.score?.sets[1].winningSide).toEqual(1);
  expect(matchUp.winningSide).toEqual(1);
});

it('supports space for completing tiebreak scores', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: 3 },
    { lowSide: 2, value: 2 },
    { value: 'space' },
    { lowSide: 2, value: 3 },
    { lowSide: 2, value: 2 },
    { value: 'space' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('4-3(2) 4-3(2)');
  expect(matchUp?.score?.sets[0].winningSide).toEqual(1);
  expect(matchUp?.score?.sets[1].winningSide).toEqual(1);
  expect(matchUp.winningSide).toEqual(1);
});

it('supports three tiebreak sets', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: 3 },
    { lowSide: 2, value: 2 },
    { value: 'space' },
    { lowSide: 1, value: 3 },
    { lowSide: 1, value: 4 },
    TIEBREAK_CLOSER,
    { lowSide: 2, value: 3 },
    { lowSide: 2, value: 2 },
    { value: 'space' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('4-3(2) 3-4(4) 4-3(2)');
  expect(matchUp?.score?.sets[0].winningSide).toEqual(1);
  expect(matchUp?.score?.sets[1].winningSide).toEqual(2);
  expect(matchUp?.score?.sets[2].winningSide).toEqual(1);
  expect(matchUp.winningSide).toEqual(1);
});

it('can handle scoreString deletions', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: 2 },
    { lowSide: 2, value: 3 },
    { lowSide: 2, value: 2 },
    { value: 'backspace' },
    { value: 'backspace' },
    { lowSide: 2, value: 1 },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  // test that tiebreak can be converted into win by 2 with scoreString = setTo + 1
  expect(matchUp.scoreString.trim()).toEqual('4-2 4-1');
  expect(matchUp.winningSide).toEqual(1);
});

it('does not allow leading zero in tiebreak scores', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: 3 },
    { lowSide: 2, value: 0 },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('4-3(0');
  expect(matchUp?.score?.sets?.length).toEqual(1);

  const { matchUp: modifiedMatchUp, info } = scoreMatchUp({
    value: '1',
    lowSide: 1,
    matchUp,
  });
  expect(modifiedMatchUp.scoreString.trim()).toEqual('4-3(0');
  expect(info).toEqual('tiebreak begins with zero');
});

it('does not allow more than two digits for set tiebreaks', () => {
  const matchUpFormat = FORMAT_FAST4;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: 3 },
    { lowSide: 2, value: 1 },
    { lowSide: 2, value: 1 },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual('4-3(11');
  expect(matchUp?.score?.sets?.length).toEqual(1);

  const { matchUp: modifiedMatchUp, info } = scoreMatchUp({
    value: '1',
    lowSide: 1,
    matchUp,
  });
  expect(modifiedMatchUp.scoreString.trim()).toEqual('4-3(11');
  expect(info).toEqual('tiebreak digit limit');
});
