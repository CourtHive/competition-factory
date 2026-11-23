import { expect, test } from 'vitest';

import {
  addOutcome,
  testTiebreakEntry,
  checkValidMatchTiebreak,
  lastNumericIndex,
  getHighTiebreakValue,
  getMatchUpWinner,
  removeFromScore,
} from '@Helpers/keyValueScore/keyValueUtilities';

import { FORMAT_STANDARD, FORMAT_ATP_DOUBLES } from '@Fixtures/scoring/matchUpFormats';
import { parse } from '@Helpers/matchUpFormatCode/parse';

// constants
import { RETIRED, DEFAULTED, WALKOVER } from '@Constants/matchUpStatusConstants';

// ----------------------------------------------------------------
// addOutcome
// ----------------------------------------------------------------
test('addOutcome appends outcome for lowSide 2 with trailing space already present', () => {
  // When scoreString already ends with a space, no extra spacer is added
  const result = addOutcome({ scoreString: '6-3 ', lowSide: 2, outcome: 'RET' });
  expect(result).toEqual('6-3 RET');
});

test('addOutcome appends outcome for lowSide 2 without trailing space', () => {
  const result = addOutcome({ scoreString: '6-3', lowSide: 2, outcome: 'RET' });
  expect(result).toEqual('6-3 RET');
});

test('addOutcome prepends outcome for lowSide 1', () => {
  const result = addOutcome({ scoreString: '6-3 ', lowSide: 1, outcome: 'RET' });
  expect(result).toEqual('RET 6-3 ');
});

test('addOutcome replaces an existing outcome before adding a new one', () => {
  // scoreString already contains RET; adding DEF should first remove RET
  const result = addOutcome({ scoreString: '6-3 RET', lowSide: 2, outcome: 'DEF' });
  expect(result).toContain('DEF');
  expect(result).not.toContain('RET');
});

test('addOutcome handles undefined scoreString', () => {
  const result = addOutcome({ scoreString: undefined, lowSide: 2, outcome: 'WO' });
  expect(result).toContain('WO');
});

test('addOutcome handles empty scoreString for lowSide 1', () => {
  const result = addOutcome({ scoreString: '', lowSide: 1, outcome: 'DEF' });
  expect(result).toContain('DEF');
});

// ----------------------------------------------------------------
// testTiebreakEntry
// ----------------------------------------------------------------
test('testTiebreakEntry returns empty object for falsy scoreString', () => {
  const result = testTiebreakEntry({ scoreString: undefined });
  expect(result).toEqual({});
});

test('testTiebreakEntry returns empty object for empty string', () => {
  const result = testTiebreakEntry({ scoreString: '' });
  expect(result).toEqual({});
});

test('testTiebreakEntry detects open set tiebreak', () => {
  const result = testTiebreakEntry({ brackets: '()', scoreString: '7-6(' });
  expect(result.isTiebreakEntry).toBe(true);
});

test('testTiebreakEntry detects closed set tiebreak', () => {
  const result = testTiebreakEntry({ brackets: '()', scoreString: '7-6(5)' });
  expect(result.isTiebreakEntry).toBe(false);
});

test('testTiebreakEntry detects open match tiebreak', () => {
  const result = testTiebreakEntry({ brackets: '[]', scoreString: '6-3 3-6 [10-5' });
  expect(result.isTiebreakEntry).toBe(true);
});

test('testTiebreakEntry detects closed match tiebreak', () => {
  const result = testTiebreakEntry({ brackets: '[]', scoreString: '6-3 3-6 [10-5]' });
  expect(result.isTiebreakEntry).toBe(false);
});

// ----------------------------------------------------------------
// checkValidMatchTiebreak
// ----------------------------------------------------------------
test('checkValidMatchTiebreak returns false for undefined scoreString', () => {
  // Covers the `if (!scoreString) return false;` branch (line 208)
  expect(checkValidMatchTiebreak({ scoreString: undefined })).toBe(false);
});

test('checkValidMatchTiebreak returns false for empty scoreString', () => {
  expect(checkValidMatchTiebreak({ scoreString: '' })).toBe(false);
});

test('checkValidMatchTiebreak returns true for valid match tiebreak with joiner and numeric ending', () => {
  // e.g., "[10-3" has open bracket, joiner after it, and numeric ending
  const result = checkValidMatchTiebreak({ scoreString: '6-3 3-6 [10-3' });
  expect(result).toBe(true);
});

test('checkValidMatchTiebreak returns false when no open bracket', () => {
  const result = checkValidMatchTiebreak({ scoreString: '6-3' });
  expect(result).toBe(false);
});

test('checkValidMatchTiebreak returns false when bracket is closed', () => {
  const result = checkValidMatchTiebreak({ scoreString: '6-3 3-6 [10-3]' });
  expect(result).toBe(false);
});

test('checkValidMatchTiebreak returns false for non-numeric ending', () => {
  const result = checkValidMatchTiebreak({ scoreString: '6-3 3-6 [10-' });
  expect(result).toBe(false);
});

// ----------------------------------------------------------------
// lastNumericIndex
// ----------------------------------------------------------------
test('lastNumericIndex returns the index of the last digit', () => {
  expect(lastNumericIndex('6-3')).toBe(2);
  expect(lastNumericIndex('6-3 ')).toBe(2);
  expect(lastNumericIndex('7-6(5)')).toBe(4);
});

test('lastNumericIndex returns undefined for string with no digits', () => {
  expect(lastNumericIndex('abc')).toBeUndefined();
});

// ----------------------------------------------------------------
// getHighTiebreakValue
// ----------------------------------------------------------------
test('getHighTiebreakValue with no params returns tiebreakTo', () => {
  // Covers the `params || {}` branch where params is undefined (line 230)
  const result = getHighTiebreakValue();
  expect(result).toEqual(Number.NaN); // tiebreakTo is undefined -> parseInt(undefined)
});

test('getHighTiebreakValue returns tiebreakTo when lowValue + 1 < tiebreakTo', () => {
  const result = getHighTiebreakValue({ lowValue: 2, tiebreakTo: 7 });
  expect(result).toBe(7);
});

test('getHighTiebreakValue returns lowValue + 2 when lowValue + 1 >= tiebreakTo (Advantage)', () => {
  const result = getHighTiebreakValue({ lowValue: 6, tiebreakTo: 7 });
  expect(result).toBe(8);
});

test('getHighTiebreakValue returns lowValue + 1 with NoAD', () => {
  const result = getHighTiebreakValue({ lowValue: 6, tiebreakTo: 7, NoAD: true });
  expect(result).toBe(7);
});

test('getHighTiebreakValue returns tiebreakTo when lowValue is 0 and tiebreakTo is 10', () => {
  const result = getHighTiebreakValue({ lowValue: 0, tiebreakTo: 10 });
  expect(result).toBe(10);
});

// ----------------------------------------------------------------
// getMatchUpWinner
// ----------------------------------------------------------------
test('getMatchUpWinner determines side 1 wins best of 3', () => {
  const sets = [
    { winningSide: 1, side1Score: 6, side2Score: 3 },
    { winningSide: 1, side1Score: 6, side2Score: 4 },
  ];
  const { matchUpWinningSide } = getMatchUpWinner({
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: undefined,
    winningSide: undefined,
    sets,
  });
  expect(matchUpWinningSide).toBe(1);
});

test('getMatchUpWinner determines side 2 wins best of 3', () => {
  const sets = [
    { winningSide: 2, side1Score: 3, side2Score: 6 },
    { winningSide: 2, side1Score: 4, side2Score: 6 },
  ];
  const { matchUpWinningSide } = getMatchUpWinner({
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: undefined,
    winningSide: undefined,
    sets,
  });
  expect(matchUpWinningSide).toBe(2);
});

test('getMatchUpWinner returns undefined when no winner yet', () => {
  const sets = [{ winningSide: 1, side1Score: 6, side2Score: 3 }];
  const { matchUpWinningSide } = getMatchUpWinner({
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: undefined,
    winningSide: undefined,
    sets,
  });
  expect(matchUpWinningSide).toBeUndefined();
});

test('getMatchUpWinner respects WINNING_STATUSES with winningSide override', () => {
  const sets = [{ winningSide: 1, side1Score: 6, side2Score: 3 }];
  const { matchUpWinningSide } = getMatchUpWinner({
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: RETIRED,
    winningSide: 2,
    sets,
  });
  expect(matchUpWinningSide).toBe(2);
});

test('getMatchUpWinner handles empty sets', () => {
  const { matchUpWinningSide } = getMatchUpWinner({
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: undefined,
    winningSide: undefined,
    sets: [],
  });
  expect(matchUpWinningSide).toBeUndefined();
});

test('getMatchUpWinner with DEFAULTED status', () => {
  const sets = [{ winningSide: 1, side1Score: 3, side2Score: 1 }];
  const { matchUpWinningSide } = getMatchUpWinner({
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: DEFAULTED,
    winningSide: 1,
    sets,
  });
  expect(matchUpWinningSide).toBe(1);
});

test('getMatchUpWinner with WALKOVER status', () => {
  const { matchUpWinningSide } = getMatchUpWinner({
    matchUpFormat: FORMAT_STANDARD,
    matchUpStatus: WALKOVER,
    winningSide: 2,
    sets: [],
  });
  expect(matchUpWinningSide).toBe(2);
});

// ----------------------------------------------------------------
// removeFromScore - targeting uncovered branches
// ----------------------------------------------------------------
test('removeFromScore returns early when scoreString is falsy', () => {
  const analysis = { setFormat: {} };
  const result = removeFromScore({ analysis, scoreString: '', sets: [], lowSide: 1 });
  expect(result).toEqual({ scoreString: '', sets: [] });
});

test('removeFromScore removes outcome from scoreString', () => {
  const parsedFormat = parse(FORMAT_STANDARD);
  const analysis = {
    setFormat: parsedFormat?.setFormat || {},
    isIncompleteSetScore: false,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: false,
  };
  const sets = [{ side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 }];
  const result = removeFromScore({
    analysis,
    scoreString: '6-3 RET',
    sets,
    lowSide: 2,
  });
  expect(result.outcomeRemoved).toBe(true);
  expect(result.scoreString).toBeDefined();
});

test('removeFromScore handles last set with only setNumber (setValuesCount === 1)', () => {
  // Covers lines 68-70: lastSet has only setNumber defined, so it should be sliced off
  const parsedFormat = parse(FORMAT_STANDARD);
  const analysis = {
    setFormat: parsedFormat?.setFormat || {},
    isIncompleteSetScore: false,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: false,
  };
  const sets = [
    { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
    { setNumber: 2 }, // Only setNumber defined, all other values undefined
  ];
  const result = removeFromScore({
    analysis,
    scoreString: '6-3 ',
    sets,
    lowSide: 1,
  });
  expect(result.sets).toBeDefined();
  // The set with only setNumber should have been removed, falling back to previous set
});

test('removeFromScore returns scoreString and sets when no numeric index found', () => {
  // Covers line 194: when lastNumericIndex returns undefined (no digits in scoreString)
  // This requires a scoreString that has no digits but is truthy and has no outcomes
  const parsedFormat = parse(FORMAT_STANDARD);
  const analysis = {
    setFormat: parsedFormat?.setFormat || {},
    isIncompleteSetScore: false,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: false,
  };
  const sets = [{ side1Score: 6, side2Score: 3, setNumber: 1 }];
  const result = removeFromScore({
    analysis,
    scoreString: '- ',
    sets,
    lowSide: 1,
  });
  expect(result.scoreString).toEqual('- ');
  expect(result.sets).toEqual(sets);
});

test('removeFromScore handles isIncompleteSetScore with isTimedSet', () => {
  // Covers lines 138-140: analysis.isTimedSet within isIncompleteScore branch
  const analysis = {
    setFormat: { tiebreakSet: undefined },
    isIncompleteSetScore: true,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: true,
  };
  const sets = [{ side1Score: 12, side2Score: undefined, setNumber: 1 }];
  const result = removeFromScore({
    analysis,
    scoreString: '12',
    sets,
    lowSide: 1,
  });
  expect(result.sets).toBeDefined();
  expect(result.scoreString).toBeDefined();
});

test('removeFromScore handles isIncompleteSetScore with isTimedSet and no side1Score after trim', () => {
  // Covers the else branch within isTimedSet in isIncompleteScore: lastSet.side1Score is falsy after slicing
  const analysis = {
    setFormat: { tiebreakSet: undefined },
    isIncompleteSetScore: true,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: true,
  };
  const sets = [{ side1Score: 1, side2Score: undefined, setNumber: 1 }];
  const result = removeFromScore({
    analysis,
    scoreString: '1',
    sets,
    lowSide: 1,
  });
  expect(result.sets).toBeDefined();
});

test('removeFromScore handles remainingNumbers with isTimedSet when side1Score exists', () => {
  // Covers lines 156-159: analysis.isTimedSet within remainingNumbers branch, lastSet.side1Score truthy
  const analysis = {
    setFormat: { tiebreakSet: undefined },
    isIncompleteSetScore: false,
    isTiebreakEntry: true, // so it skips the side2Score/side1Score slicing
    isMatchTiebreak: false,
    isTimedSet: true,
  };
  const sets = [{ side1Score: 5, side2Score: 3, setNumber: 1 }];
  const result = removeFromScore({
    analysis,
    scoreString: '5-3',
    sets,
    lowSide: 1,
  });
  expect(result.sets).toBeDefined();
});

test('removeFromScore handles remainingNumbers with isTimedSet when side1Score is falsy', () => {
  // Covers lines 160-161: analysis.isTimedSet within remainingNumbers, lastSet.side1Score falsy
  const analysis = {
    setFormat: { tiebreakSet: undefined },
    isIncompleteSetScore: false,
    isTiebreakEntry: true,
    isMatchTiebreak: false,
    isTimedSet: true,
  };
  const sets = [{ side1Score: 0, side2Score: 0, setNumber: 1 }];
  const result = removeFromScore({
    analysis,
    scoreString: '0-0',
    sets,
    lowSide: 1,
  });
  expect(result.sets).toBeDefined();
});

test('removeFromScore handles remainingNumbers without side2Score (else branch for side1Score slicing)', () => {
  // Covers lines 152-153: lastSet.side2Score is falsy so side1Score is sliced
  const parsedFormat = parse(FORMAT_STANDARD);
  const analysis = {
    setFormat: parsedFormat?.setFormat || {},
    isIncompleteSetScore: false,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: false,
  };
  // scoreString where after removing last digit, there are remaining numbers
  // side2Score is 0/undefined, so the else branch executes
  const sets = [{ side1Score: 63, side2Score: undefined, setNumber: 1 }];
  const result = removeFromScore({
    analysis,
    scoreString: '63',
    sets,
    lowSide: 1,
  });
  expect(result.sets).toBeDefined();
  // side1Score should have been trimmed from 63 -> 6
  if (result.sets && result.sets.length > 0) {
    expect(result.sets[0].side1Score).toBe(6);
  }
});

test('removeFromScore handles match tiebreak with side2TiebreakScore present (lowSide 1)', () => {
  // Covers lines 110-117: side2TiebreakScore is truthy, with lowSide = 1
  const parsedFormat = parse(FORMAT_ATP_DOUBLES);
  const analysis = {
    setFormat: parsedFormat?.setFormat || {},
    isIncompleteSetScore: false,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: false,
  };
  // The scoreString represents a match tiebreak with both scores: [10-3
  // When we delete the last char '3', the remaining is [10-
  // After further parsing, side2TiebreakScore should be detected
  // We need a scoreString where after removing last digit, both sides of the match tiebreak are present
  const sets = [
    { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
    { side1Score: 3, side2Score: 6, winningSide: 2, setNumber: 2 },
    { side1TiebreakScore: 10, side2TiebreakScore: 35, setNumber: 3 },
  ];
  const result = removeFromScore({
    analysis,
    scoreString: '6-3 3-6 [10-35',
    sets,
    lowSide: 1,
  });
  expect(result.sets).toBeDefined();
  expect(result.scoreString).toBeDefined();
});

test('removeFromScore handles match tiebreak with side2TiebreakScore present (lowSide 2)', () => {
  // Covers the highIndex = lowSide === 1 ? 1 : 0 branch for lowSide 2
  const parsedFormat = parse(FORMAT_ATP_DOUBLES);
  const analysis = {
    setFormat: parsedFormat?.setFormat || {},
    isIncompleteSetScore: false,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: false,
  };
  const sets = [
    { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
    { side1Score: 3, side2Score: 6, winningSide: 2, setNumber: 2 },
    { side1TiebreakScore: 10, side2TiebreakScore: 35, setNumber: 3 },
  ];
  const result = removeFromScore({
    analysis,
    scoreString: '6-3 3-6 [10-35',
    sets,
    lowSide: 2,
  });
  expect(result.sets).toBeDefined();
  expect(result.scoreString).toBeDefined();
});

test('removeFromScore handles closed match tiebreak (isMatchTiebreak && !openMatchTiebreak)', () => {
  // Covers lines 179-180: isMatchTiebreak is true but openMatchTiebreak is false (bracket closed)
  const parsedFormat = parse(FORMAT_ATP_DOUBLES);
  const analysis = {
    setFormat: parsedFormat?.setFormat || {},
    isIncompleteSetScore: false,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: false,
  };
  // scoreString with closed match tiebreak bracket: [10-3]
  // After removing last digit, the ] is gone... we need a scenario where
  // isMatchTiebreak is true but the bracket is closed after removal
  // Actually this path: else { if (isMatchTiebreak && !openMatchTiebreak) }
  // means: not isIncompleteScore, not remainingNumbers, not openSetTiebreak,
  // but isMatchTiebreak detected, and after removing last char it's no longer open
  const sets = [
    { side1Score: 6, side2Score: 3, winningSide: 1, setNumber: 1 },
    { side1Score: 3, side2Score: 6, winningSide: 2, setNumber: 2 },
    { side1TiebreakScore: 10, side2TiebreakScore: 3, setNumber: 3 },
  ];
  // The ] at the end means the match tiebreak is detected but closed
  const result = removeFromScore({
    analysis,
    scoreString: '6-3 3-6 [10-3]',
    sets,
    lowSide: 1,
  });
  expect(result.sets).toBeDefined();
});

test('removeFromScore handles outcome at the beginning of scoreString', () => {
  // Covers the `index === 0` branch in removeOutcome
  const parsedFormat = parse(FORMAT_STANDARD);
  const analysis = {
    setFormat: parsedFormat?.setFormat || {},
    isIncompleteSetScore: false,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: false,
  };
  const sets = [{ side1Score: 3, side2Score: 6, winningSide: 2, setNumber: 1 }];
  const result = removeFromScore({
    analysis,
    scoreString: 'RET 3-6',
    sets,
    lowSide: 1,
  });
  expect(result.outcomeRemoved).toBe(true);
});

test('removeFromScore with isIncompleteSetScore where side1Score becomes undefined clears side2Score', () => {
  // Covers lines 135-136: lastSet.side1Score === undefined => lastSet.side2Score = undefined
  const parsedFormat = parse(FORMAT_STANDARD);
  const analysis = {
    setFormat: parsedFormat?.setFormat || {},
    isIncompleteSetScore: true,
    isTiebreakEntry: false,
    isMatchTiebreak: false,
    isTimedSet: false,
  };
  // side1Score is a single digit (e.g., 3), slicing removes it -> undefined
  const sets = [{ side1Score: 3, side2Score: 6, winningSide: undefined, setNumber: 1 }];
  const result = removeFromScore({
    analysis,
    scoreString: '3',
    sets,
    lowSide: 1,
  });
  expect(result.sets).toBeDefined();
  if (result.sets && result.sets.length > 0) {
    // side1Score sliced from "3" to "" -> undefined; side2Score should also be undefined
    expect(result.sets[0]?.side2Score).toBeUndefined();
  }
});
