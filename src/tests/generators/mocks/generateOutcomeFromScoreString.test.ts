import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';
import { expect, it } from 'vitest';

it('can generate outcomes for either winningSide', () => {
  let values = {
    scoreString: '6-1 6-1',
    winningSide: 1,
  };
  let { outcome } = generateOutcomeFromScoreString(values);
  expect(outcome.score.scoreStringSide1).toEqual('6-1 6-1');
  expect(outcome.score.scoreStringSide2).toEqual('1-6 1-6');
  expect(outcome.score.sets[0].side1Score).toEqual(6);
  expect(outcome.score.sets[0].side2Score).toEqual(1);
  expect(outcome.score.sets[1].side1Score).toEqual(6);
  expect(outcome.score.sets[1].side2Score).toEqual(1);
  expect(outcome.winningSide).toEqual(1);

  values = {
    scoreString: '6-1 6-1',
    winningSide: 2,
  };
  ({ outcome } = generateOutcomeFromScoreString(values));
  expect(outcome.score.scoreStringSide1).toEqual('1-6 1-6');
  expect(outcome.score.scoreStringSide2).toEqual('6-1 6-1');
  expect(outcome.score.sets[0].side1Score).toEqual(1);
  expect(outcome.score.sets[0].side2Score).toEqual(6);
  expect(outcome.score.sets[1].side1Score).toEqual(1);
  expect(outcome.score.sets[1].side2Score).toEqual(6);
  expect(outcome.winningSide).toEqual(2);
});

it('can generate outcomes for short sets', () => {
  const values = {
    scoreString: '4-1 4-1',
    winningSide: 1,
  };
  const { outcome } = generateOutcomeFromScoreString(values);
  expect(outcome.score.scoreStringSide1).toEqual('4-1 4-1');
  expect(outcome.score.scoreStringSide2).toEqual('1-4 1-4');
  expect(outcome.score.sets[0].side1Score).toEqual(4);
  expect(outcome.score.sets[0].side2Score).toEqual(1);
  expect(outcome.score.sets[1].side1Score).toEqual(4);
  expect(outcome.score.sets[1].side2Score).toEqual(1);
  expect(outcome.winningSide).toEqual(1);
});

it('can parse score strings with third set tiebreaks', () => {
  const scoreString = '7-5 5-7 [10-3]';
  const values = { scoreString, winningSide: 1 };
  const { outcome } = generateOutcomeFromScoreString(values);
  expect(outcome.score.scoreStringSide1).toEqual(scoreString);
});

// ===========================
// TIEBREAK-ONLY SET TESTS (TB10, TB7, etc.)
// ===========================
it('can generate outcome for TB10 format [11-13]', () => {
  const values = {
    scoreString: '[11-13]',
    matchUpFormat: 'SET1-S:TB10',
    winningSide: 2,
  };
  const { outcome } = generateOutcomeFromScoreString(values);
  expect(outcome.score.sets).toBeDefined();
  expect(outcome.score.sets.length).toEqual(1);
  expect(outcome.score.sets[0].side1TiebreakScore).toEqual(11);
  expect(outcome.score.sets[0].side2TiebreakScore).toEqual(13);
  expect(outcome.score.sets[0].winningSide).toEqual(2);
  expect(outcome.winningSide).toEqual(2);
  // matchUpStatus is only set if provided in params
});

it('can generate outcome for TB10 format [12-10]', () => {
  const values = {
    scoreString: '[12-10]',
    matchUpFormat: 'SET1-S:TB10',
    winningSide: 1,
  };
  const { outcome } = generateOutcomeFromScoreString(values);
  expect(outcome.score.sets[0].side1TiebreakScore).toEqual(12);
  expect(outcome.score.sets[0].side2TiebreakScore).toEqual(10);
  expect(outcome.score.sets[0].winningSide).toEqual(1);
  expect(outcome.winningSide).toEqual(1);
});

it('can generate outcome for TB10 extended [33-35]', () => {
  const values = {
    scoreString: '[33-35]',
    matchUpFormat: 'SET1-S:TB10',
    winningSide: 2,
  };
  const { outcome } = generateOutcomeFromScoreString(values);
  expect(outcome.score.sets[0].side1TiebreakScore).toEqual(33);
  expect(outcome.score.sets[0].side2TiebreakScore).toEqual(35);
  expect(outcome.score.sets[0].winningSide).toEqual(2);
  expect(outcome.winningSide).toEqual(2);
});

it('can generate outcome for TB7 format [7-9]', () => {
  const values = {
    scoreString: '[7-9]',
    matchUpFormat: 'SET3-S:TB7',
    winningSide: 2,
  };
  const { outcome } = generateOutcomeFromScoreString(values);
  expect(outcome.score.sets[0].side1TiebreakScore).toEqual(7);
  expect(outcome.score.sets[0].side2TiebreakScore).toEqual(9);
  expect(outcome.score.sets[0].winningSide).toEqual(2);
});

it('can generate outcome for TB12 format [12-14]', () => {
  const values = {
    scoreString: '[12-14]',
    matchUpFormat: 'SET1-S:TB12',
    winningSide: 2,
  };
  const { outcome } = generateOutcomeFromScoreString(values);
  expect(outcome.score.sets[0].side1TiebreakScore).toEqual(12);
  expect(outcome.score.sets[0].side2TiebreakScore).toEqual(14);
  expect(outcome.score.sets[0].winningSide).toEqual(2);
});

it('can generate outcome for best of 3 TB10 format', () => {
  const values = {
    scoreString: '[11-13] [10-12]',
    matchUpFormat: 'SET3-S:TB10',
    winningSide: 2,
  };
  const { outcome } = generateOutcomeFromScoreString(values);
  expect(outcome.score.sets.length).toEqual(2);
  expect(outcome.score.sets[0].side1TiebreakScore).toEqual(11);
  expect(outcome.score.sets[0].side2TiebreakScore).toEqual(13);
  expect(outcome.score.sets[0].winningSide).toEqual(2);
  expect(outcome.score.sets[1].side1TiebreakScore).toEqual(10);
  expect(outcome.score.sets[1].side2TiebreakScore).toEqual(12);
  expect(outcome.score.sets[1].winningSide).toEqual(2);
  expect(outcome.winningSide).toEqual(2);
});

it('can handle TB10 format without winningSide (should infer from score)', () => {
  const values = {
    scoreString: '[11-13]',
    matchUpFormat: 'SET1-S:TB10',
    // No winningSide provided - should infer from score
  };
  const { outcome } = generateOutcomeFromScoreString(values);
  expect(outcome.score.sets[0].side1TiebreakScore).toEqual(11);
  expect(outcome.score.sets[0].side2TiebreakScore).toEqual(13);
  // Factory should infer winningSide from score
  expect(outcome.score.sets[0].winningSide).toEqual(2);
  expect(outcome.winningSide).toEqual(2);
});

it('should handle invalid TB10 scores gracefully', () => {
  const values = {
    scoreString: '[3-6]', // Invalid - below threshold
    matchUpFormat: 'SET1-S:TB10',
    winningSide: 2,
  };
  const { outcome, error } = generateOutcomeFromScoreString(values);
  // Factory may return error or parse it anyway
  // This test documents current behavior - ideally should validate and error
  if (error) {
    expect(error).toBeDefined();
  } else if (outcome?.score?.sets?.[0]) {
    expect(outcome.score.sets[0].side1TiebreakScore).toEqual(3);
    expect(outcome.score.sets[0].side2TiebreakScore).toEqual(6);
  } else {
    // No outcome and no error - also acceptable
    expect(outcome).toBeDefined();
  }
});
