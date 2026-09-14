import { generateScoreString } from '@Assemblies/generators/matchUps/generateScoreString';
import { expect, it, test } from 'vitest';

// constants
import { RETIRED } from '@Constants/matchUpStatusConstants';

test('can generate matchUp tiebreak string scores', () => {
  const sets = [
    { side1TiebreakScore: 10, side2TiebreakScore: 3 },
    { side1TiebreakScore: 1, side2TiebreakScore: 10 },
    { side1TiebreakScore: 3 },
  ];
  const result = generateScoreString({ sets, autoComplete: true });
  expect(result).toEqual('[10-3] [1-10] [3-0]');
});

test('can generate matchUp set scores when no tiebreak', () => {
  const sets = [{ side1Score: 7, side2Score: 3 }, { side1Score: 1, side2Score: 7 }, { side1Score: 3 }];
  const result = generateScoreString({ sets, autoComplete: true });
  expect(result).toEqual('7-3 1-7 3-0');
});

test('can generate matchUp set scores with set tiebreak', () => {
  const sets = [
    {
      side1Score: 6,
      side2Score: 7,
      side1TiebreakScore: 3,
      side2TiebreakScore: 7,
      winningSide: 2,
    },
    {
      side1Score: 7,
      side2Score: 6,
      side1TiebreakScore: 14,
      side2TiebreakScore: 12,
      winningSide: 1,
    },
    { side1Score: 3 },
  ];
  let result = generateScoreString({ setTBlast: false, sets, autoComplete: true });
  expect(result).toEqual('6(3)-7 7-6(12) 3-0');

  // Test to make it clear what `setTBlast` means:
  // when true, the tiebreak score always appears last in set score string
  // when false, the tiebreak score is listed in parentheses after the losing set score
  result = generateScoreString({ setTBlast: true, sets, autoComplete: true });
  expect(result).toEqual('6-7(3) 7-6(12) 3-0');

  result = generateScoreString({ setTBlast: false, sets, autoComplete: true, reversed: true });
  expect(result).toEqual('7-6(3) 6(12)-7 0-3');
});

test('can append a scoreString outcome', () => {
  const sets = [
    {
      side1Score: 6,
      side2Score: 7,
      side1TiebreakScore: 3,
      side2TiebreakScore: 7,
      winningSide: 2,
    },
    {
      side1Score: 7,
      side2Score: 6,
      side1TiebreakScore: 14,
      side2TiebreakScore: 12,
      winningSide: 1,
    },
    { side1Score: 3 },
  ];
  let result = generateScoreString({
    matchUpStatus: RETIRED,
    addOutcomeString: true,
    autoComplete: true,
    setTBlast: false,
    winningSide: 1,
    sets,
  });
  expect(result).toEqual('6(3)-7 7-6(12) 3-0 RET');
  result = generateScoreString({
    addOutcomeString: true,
    matchUpStatus: RETIRED,
    autoComplete: true,
    setTBlast: false,
    winningSide: 1,
    reversed: true,
    sets,
  });
  expect(result).toEqual('7-6(3) 6(12)-7 0-3 RET');
});

test('can prepend a scoreString outcome', () => {
  const sets = [
    {
      side1Score: 6,
      side2Score: 7,
      side1TiebreakScore: 3,
      side2TiebreakScore: 7,
      winningSide: 2,
    },
    {
      side1Score: 7,
      side2Score: 6,
      side1TiebreakScore: 14,
      side2TiebreakScore: 12,
      winningSide: 1,
    },
    { side1Score: 3 },
  ];
  const result = generateScoreString({
    sets,
    winningSide: 2,
    autoComplete: true,
    matchUpStatus: RETIRED,
    addOutcomeString: true,
    setTBlast: false,
  });
  expect(result).toEqual('RET 7-6(3) 6(12)-7 0-3');
});

test('can generate with winningSide perspective', () => {
  const sets = [
    {
      side1Score: 6,
      side2Score: 7,
      side1TiebreakScore: 3,
      side2TiebreakScore: 7,
      winningSide: 2,
    },
    {
      side1Score: 6,
      side2Score: 7,
      side1TiebreakScore: 12,
      side2TiebreakScore: 14,
      winningSide: 2,
    },
  ];
  const result = generateScoreString({ setTBlast: false, sets, winningSide: 2 });
  expect(result).toEqual('7-6(3) 7-6(12)');
});

test('can ignore winningSide perspective', () => {
  const sets = [
    {
      side1Score: 6,
      side2Score: 7,
      side1TiebreakScore: 3,
      side2TiebreakScore: 7,
      winningSide: 2,
    },
    {
      side1Score: 6,
      side2Score: 7,
      side1TiebreakScore: 12,
      side2TiebreakScore: 14,
      winningSide: 2,
    },
  ];
  const result = generateScoreString({
    sets,
    winningSide: 2,
    winnerFirst: false,
    setTBlast: false,
  });
  expect(result).toEqual('6(3)-7 6(12)-7');
});

test('properly sorts set results', () => {
  const sets = [
    {
      setNumber: 2,
      side1Score: 6,
      side2Score: 7,
      side1TiebreakScore: 3,
      side2TiebreakScore: 7,
      winningSide: 2,
    },
    {
      setNumber: 1,
      side1Score: 7,
      side2Score: 6,
      side1TiebreakScore: 14,
      side2TiebreakScore: 12,
      winningSide: 1,
    },
    { side1Score: 3 },
  ];
  const result = generateScoreString({ setTBlast: false, sets, autoComplete: true });
  expect(result).toEqual('7-6(12) 6(3)-7 3-0');
});

test('generate incomplete scoreString string', () => {
  const sets = [
    {
      setNumber: 2,
      side1Score: 6,
      side2Score: 7,
      side1TiebreakScore: 3,
      side2TiebreakScore: 7,
      winningSide: 2,
    },
    {
      setNumber: 1,
      side1Score: 7,
      side2Score: 6,
      side1TiebreakScore: 14,
      side2TiebreakScore: 12,
      winningSide: 1,
    },
    { side1Score: 3 },
  ];
  const result = generateScoreString({ setTBlast: false, sets, autoComplete: false });
  expect(result).toEqual('7-6(12) 6(3)-7 3-');
});

it('returns empty string when no sets', () => {
  let sets: any[] = [];
  let result = generateScoreString({ sets, autoComplete: false });
  expect(result).toEqual('');

  sets = [
    {
      setNumber: 1,
      side1Score: undefined,
      side2Score: undefined,
      side1TiebreakScore: undefined,
      side2TiebreakScore: undefined,
    },
  ];

  result = generateScoreString({ sets, autoComplete: false });
  expect(result).toEqual('');

  sets = [
    {
      setNumber: 1,
      side1Score: '',
      side2Score: '',
      side1TiebreakScore: '',
      side2TiebreakScore: '',
    },
  ];

  result = generateScoreString({ sets, autoComplete: false });
  expect(result).toEqual('');

  sets = [
    {
      setNumber: 1,
      side1Score: undefined,
      side2Score: undefined,
      side1TiebreakScore: undefined,
      side2TiebreakScore: undefined,
    },
    {
      setNumber: 2,
      side1Score: undefined,
      side2Score: undefined,
      side1TiebreakScore: undefined,
      side2TiebreakScore: undefined,
    },
  ];

  result = generateScoreString({ sets, autoComplete: false });
  expect(result).toEqual('');
});

it('handles zero', () => {
  let sets: any[] = [];
  let result = generateScoreString({ sets, autoComplete: false });
  expect(result).toEqual('');

  sets = [
    {
      setNumber: 1,
      side1Score: 0,
      side2Score: 6,
      side1TiebreakScore: undefined,
      side2TiebreakScore: undefined,
    },
  ];

  result = generateScoreString({ sets, autoComplete: false });
  expect(result).toEqual('0-6');
});

it('generates tiebreak sets', () => {
  const sets = [
    {
      setNumber: 1,
      side1TiebreakScore: 6,
      side2TiebreakScore: 8,
      winningSide: 2,
    },
    {
      setNumber: 2,
      side1TiebreakScore: 6,
      side2TiebreakScore: 8,
      winningSide: 2,
    },
  ];
  let result = generateScoreString({ sets });
  expect(result).toEqual('[6-8] [6-8]');
  result = generateScoreString({ sets, winningSide: 2 });
  expect(result).toEqual('[8-6] [8-6]');
});
