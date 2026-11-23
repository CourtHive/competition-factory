import { scoreMatchUp, enterValues } from './primitives';
import { singleSetStressTests } from './standardStress';
import { expect, it } from 'vitest';

// Fixtures
import { FORMAT_COLLEGE_PRO_SET } from '@Fixtures/scoring/matchUpFormats';

singleSetStressTests({ matchUpFormat: FORMAT_COLLEGE_PRO_SET, setTo: 8 });

it('generates appropriate high scoreString', () => {
  const matchUpFormat = FORMAT_COLLEGE_PRO_SET;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [{ lowSide: 2, value: '3' }];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`8-3`);
  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toEqual(1);

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '2', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`8-2`);
  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toEqual(1);
});

it('appropriately handles tiebreaAt for side 1', () => {
  const matchUpFormat = FORMAT_COLLEGE_PRO_SET;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 1, value: '8' }, // should be ignored
    { lowSide: 2, value: '7' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`8-7(`);
  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '8', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`8-`);
  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '7', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`8-7(`);
  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toBeUndefined();
});

it('appropriately handles tiebreaAt for side 2', () => {
  const matchUpFormat = FORMAT_COLLEGE_PRO_SET;
  let matchUp: any = { scoreString: undefined, sets: [], matchUpFormat };

  const values = [
    { lowSide: 2, value: '8' }, // should be ignored
    { lowSide: 1, value: '7' },
  ];

  ({ matchUp } = enterValues({ values, matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`7-8(`);
  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '7', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`7-7`);
  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toBeUndefined();

  ({ matchUp } = scoreMatchUp({ value: 'backspace', matchUp }));
  ({ matchUp } = scoreMatchUp({ lowSide: 2, value: '8', matchUp }));
  expect(matchUp.scoreString.trim()).toEqual(`7-8(`);
  expect(matchUp.score?.sets.length).toEqual(1);
  expect(matchUp.winningSide).toBeUndefined();
});
