import { validateSetScore, validateMatchUpScore } from '@Validators/validateMatchUpScore';
import { expect, it } from 'vitest';

// constants
import { COMPLETED, RETIRED } from '@Constants/matchUpStatusConstants';

it('validates timed sets with games-based scoring (default)', () => {
  const matchUpFormat = 'SET3X-S:T10';

  // Valid: side 1 wins 15-10
  let set = { side1Score: 15, side2Score: 10, winningSide: 1 };
  let result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Valid: side 2 wins 20-15
  set = { side1Score: 15, side2Score: 20, winningSide: 2 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Valid: close score 10-9
  set = { side1Score: 10, side2Score: 9, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Invalid: both scores are zero
  set = { side1Score: 0, side2Score: 0, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(false);
  expect(result.error).toContain('at least one side');
});

it('validates timed sets with points-based scoring (P)', () => {
  const matchUpFormat = 'SET3X-S:T10P';

  // Valid: side 1 wins 30-25
  let set = { side1Score: 30, side2Score: 25, winningSide: 1 };
  let result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Valid: high score 100-80
  set = { side1Score: 100, side2Score: 80, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Valid: one-sided 50-5
  set = { side1Score: 50, side2Score: 5, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Invalid: both zero
  set = { side1Score: 0, side2Score: 0, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(false);
});

it('validates timed sets with aggregate scoring (A)', () => {
  const matchUpFormat = 'SET2XA-S:T10';

  // Valid: normal aggregate score
  let set = { side1Score: 45, side2Score: 38, winningSide: 1 };
  let result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Valid: large aggregate score
  set = { side1Score: 150, side2Score: 120, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Invalid: both zero
  set = { side1Score: 0, side2Score: 0, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(false);
});

it('validates timed sets with tied scores and tiebreak', () => {
  const matchUpFormat = 'SET3X-S:T10P/TB1';

  // Valid: tied scores with tiebreak
  let set = {
    side1Score: 30,
    side2Score: 30,
    side1TiebreakScore: 1,
    side2TiebreakScore: 0,
    winningSide: 1,
  };
  let result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Invalid: tied scores without tiebreak
  set = { side1Score: 30, side2Score: 30, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(false);
  expect(result.error).toContain('Tied timed set requires tiebreak');

  // Valid: not tied, no tiebreak needed
  set = { side1Score: 31, side2Score: 30, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);
});

it('validates timed sets without tiebreak format (tied allowed)', () => {
  const matchUpFormat = 'SET3XA-S:T10';

  // Valid: tied scores without tiebreak format is allowed
  // (format doesn't specify tiebreak, so tie stands)
  let set = { side1Score: 30, side2Score: 30, winningSide: 1 };
  let result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);
});

it('validates incomplete timed sets (in progress)', () => {
  const matchUpFormat = 'SET3X-S:T10';

  // Valid: incomplete with allowIncomplete=true
  let set = { side1Score: 5, side2Score: 3 };
  let result = validateSetScore(set, matchUpFormat, false, true);
  expect(result.isValid).toEqual(true);

  // Valid: even zero scores allowed when incomplete
  set = { side1Score: 0, side2Score: 0 };
  result = validateSetScore(set, matchUpFormat, false, true);
  expect(result.isValid).toEqual(true);
});

it('validates multiple timed sets in a match', () => {
  const matchUpFormat = 'SET3XA-S:T10';

  const sets = [
    { side1Score: 30, side2Score: 25, setNumber: 1, winningSide: 1 },
    { side1Score: 20, side2Score: 28, setNumber: 2, winningSide: 2 },
    { side1Score: 35, side2Score: 30, setNumber: 3, winningSide: 1 },
  ];

  const result = validateMatchUpScore(sets, matchUpFormat, COMPLETED);
  expect(result.isValid).toEqual(true);
});

it('validates timed sets with final set different format', () => {
  const matchUpFormat = 'SET3XA-S:T10-F:T10P';

  // Different final set format (points instead of aggregate)
  const sets = [
    { side1Score: 30, side2Score: 25, setNumber: 1, winningSide: 1 },
    { side1Score: 25, side2Score: 30, setNumber: 2, winningSide: 2 },
    { side1Score: 35, side2Score: 32, setNumber: 3, winningSide: 1 },
  ];

  const result = validateMatchUpScore(sets, matchUpFormat, COMPLETED);
  expect(result.isValid).toEqual(true);
});

it('validates timed sets with different final set format', () => {
  const matchUpFormat = 'SET3-S:6/TB7-F:T20P';

  // Regular sets followed by timed final set
  const sets = [
    { side1Score: 6, side2Score: 4, setNumber: 1, winningSide: 1 },
    { side1Score: 4, side2Score: 6, setNumber: 2, winningSide: 2 },
    { side1Score: 45, side2Score: 40, setNumber: 3, winningSide: 1 }, // Timed final set
  ];

  // Validate final set as timed (isDecidingSet = true)
  const finalSetResult = validateSetScore(sets[2], matchUpFormat, true, false);
  expect(finalSetResult.isValid).toEqual(true);

  // Validate all sets together
  const result = validateMatchUpScore(sets, matchUpFormat, COMPLETED);
  expect(result.isValid).toEqual(true);
});

it('validates retired match with incomplete timed sets', () => {
  const matchUpFormat = 'SET3X-S:T10P';

  const sets = [
    { side1Score: 30, side2Score: 25, setNumber: 1, winningSide: 1 },
    { side1Score: 15, side2Score: 10, setNumber: 2 }, // Incomplete
  ];

  const result = validateMatchUpScore(sets, matchUpFormat, RETIRED);
  expect(result.isValid).toEqual(true);
});

it('validates single timed set format', () => {
  const matchUpFormat = 'SET1A-S:T20';

  // Valid single timed set
  let set = { side1Score: 50, side2Score: 45, winningSide: 1 };
  let result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Invalid: zero scores
  set = { side1Score: 0, side2Score: 0, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(false);
});

it('validates bestOf with timed sets', () => {
  const matchUpFormat = 'SET3A-S:T10';

  const sets = [
    { side1Score: 35, side2Score: 30, setNumber: 1, winningSide: 1 },
    { side1Score: 28, side2Score: 32, setNumber: 2, winningSide: 2 },
    { side1Score: 40, side2Score: 38, setNumber: 3, winningSide: 1 },
  ];

  const result = validateMatchUpScore(sets, matchUpFormat, COMPLETED);
  expect(result.isValid).toEqual(true);
});

it('rejects invalid timed set scores', () => {
  const matchUpFormat = 'SET3X-S:T10P/TB1';

  // Invalid: tied with required tiebreak but missing
  let sets = [
    { side1Score: 30, side2Score: 30, setNumber: 1, winningSide: 1 }, // No tiebreak!
  ];

  let result = validateMatchUpScore(sets, matchUpFormat, COMPLETED);
  expect(result.isValid).toEqual(false);
  expect(result.error).toContain('tiebreak');

  // Valid: same score with tiebreak (all three sets played: an exactly-3 match is COMPLETED only then)
  sets = [
    {
      side1Score: 30,
      side2Score: 30,
      side1TiebreakScore: 1,
      side2TiebreakScore: 0,
      setNumber: 1,
      winningSide: 1,
    },
    { side1Score: 25, side2Score: 30, setNumber: 2, winningSide: 2 },
    { side1Score: 30, side2Score: 20, setNumber: 3, winningSide: 1 },
  ];

  result = validateMatchUpScore(sets, matchUpFormat, COMPLETED);
  expect(result.isValid).toEqual(true);
});

it('validates timed sets with various score ranges', () => {
  const matchUpFormat = 'SET2X-S:T10';

  // Low scores
  let set = { side1Score: 2, side2Score: 1, winningSide: 1 };
  let result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Medium scores
  set = { side1Score: 15, side2Score: 12, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // High scores (no upper limit for timed sets)
  set = { side1Score: 250, side2Score: 200, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);
});

it('validates timed sets do not require win margin', () => {
  const matchUpFormat = 'SET3X-S:T10P';

  // Valid: 1 point difference (no win margin requirement)
  let set = { side1Score: 31, side2Score: 30, winningSide: 1 };
  let result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);

  // Valid: large difference is also fine
  set = { side1Score: 50, side2Score: 10, winningSide: 1 };
  result = validateSetScore(set, matchUpFormat, false, false);
  expect(result.isValid).toEqual(true);
});
