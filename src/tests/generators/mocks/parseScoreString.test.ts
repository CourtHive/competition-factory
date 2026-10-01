import { parseScoreString } from '@Tools/parseScoreString';
import { describe, expect, it } from 'vitest';

it('can parse match tiebreaks', () => {
  let scoreString = '[10-3]';
  let sets = parseScoreString({ scoreString });
  expect(sets[0].side1Score).toEqual(undefined);
  expect(sets[0].side2Score).toEqual(undefined);
  expect(sets[0].side1TiebreakScore).toEqual(10);
  expect(sets[0].side2TiebreakScore).toEqual(3);

  scoreString = '[3-10]';
  sets = parseScoreString({ scoreString });
  expect(sets[0].side1Score).toEqual(undefined);
  expect(sets[0].side2Score).toEqual(undefined);
  expect(sets[0].side1TiebreakScore).toEqual(3);
  expect(sets[0].side2TiebreakScore).toEqual(10);
});

it('can parse set tiebreaks', () => {
  let scoreString = '7-6(3)';
  let sets = parseScoreString({ scoreString });
  expect(sets[0].side1Score).toEqual(7);
  expect(sets[0].side2Score).toEqual(6);
  expect(sets[0].side1TiebreakScore).toEqual(7);
  expect(sets[0].side2TiebreakScore).toEqual(3);

  scoreString = '6-7(3)';
  sets = parseScoreString({ scoreString });
  expect(sets[0].side1Score).toEqual(6);
  expect(sets[0].side2Score).toEqual(7);
  expect(sets[0].side1TiebreakScore).toEqual(3);
  expect(sets[0].side2TiebreakScore).toEqual(7);
});

it('can parse winner and loser score strings', () => {
  let scoreString = '6-1 6-1';
  let sets = parseScoreString({ scoreString });
  expect(sets[0].side1Score).toEqual(6);
  expect(sets[0].side2Score).toEqual(1);
  expect(sets[1].side1Score).toEqual(6);
  expect(sets[1].side2Score).toEqual(1);

  expect(sets[0].winningSide).toEqual(1);
  expect(sets[1].winningSide).toEqual(1);

  scoreString = '1-6 1-6';
  sets = parseScoreString({ scoreString });
  expect(sets[0].side1Score).toEqual(1);
  expect(sets[0].side2Score).toEqual(6);
  expect(sets[1].side1Score).toEqual(1);
  expect(sets[1].side2Score).toEqual(6);

  expect(sets[0].winningSide).toEqual(2);
  expect(sets[1].winningSide).toEqual(2);

  scoreString = '7-6(3) 6-7(2) 7-5';
  sets = parseScoreString({ scoreString });
  expect(sets[0].side1Score).toEqual(7);
  expect(sets[0].side2Score).toEqual(6);
  expect(sets[0].side1TiebreakScore).toEqual(7);
  expect(sets[0].side2TiebreakScore).toEqual(3);

  expect(sets[1].side1Score).toEqual(6);
  expect(sets[1].side2Score).toEqual(7);
  expect(sets[1].side1TiebreakScore).toEqual(2);
  expect(sets[1].side2TiebreakScore).toEqual(7);

  expect(sets[2].side1Score).toEqual(7);
  expect(sets[2].side2Score).toEqual(5);

  expect(sets[0].winningSide).toEqual(1);
  expect(sets[1].winningSide).toEqual(2);
  expect(sets[2].winningSide).toEqual(1);
});

it('can parse tiebreaks with custom tiebreakTo from matchUpFormat', () => {
  // Standard format with TB7
  let scoreString = '7-6(3)';
  let matchUpFormat = 'SET3-S:6/TB7';
  let sets = parseScoreString({ scoreString, matchUpFormat });
  expect(sets[0].side1Score).toEqual(7);
  expect(sets[0].side2Score).toEqual(6);
  expect(sets[0].side1TiebreakScore).toEqual(7);
  expect(sets[0].side2TiebreakScore).toEqual(3);

  // Format with TB9
  scoreString = '4-5(3)';
  matchUpFormat = 'SET1-S:5/TB9@4';
  sets = parseScoreString({ scoreString, matchUpFormat });
  expect(sets[0].side1Score).toEqual(4);
  expect(sets[0].side2Score).toEqual(5);
  expect(sets[0].side1TiebreakScore).toEqual(3);
  expect(sets[0].side2TiebreakScore).toEqual(9);

  // Format with TB10
  scoreString = '7-6(5)';
  matchUpFormat = 'SET3-S:6/TB10';
  sets = parseScoreString({ scoreString, matchUpFormat });
  expect(sets[0].side1Score).toEqual(7);
  expect(sets[0].side2Score).toEqual(6);
  expect(sets[0].side1TiebreakScore).toEqual(10);
  expect(sets[0].side2TiebreakScore).toEqual(5);

  // Format with TB12
  scoreString = '6-7(8)';
  matchUpFormat = 'SET3-S:6/TB12';
  sets = parseScoreString({ scoreString, matchUpFormat });
  expect(sets[0].side1Score).toEqual(6);
  expect(sets[0].side2Score).toEqual(7);
  expect(sets[0].side1TiebreakScore).toEqual(8);
  expect(sets[0].side2TiebreakScore).toEqual(12);
});

it('can parse tiebreaks with finalSetFormat different from main format', () => {
  // SET3-S:6/TB7 F:TB10 - first two sets use TB7, final set is TB10
  let scoreString = '7-6(3) 6-7(4) [11-9]';
  let matchUpFormat = 'SET3-S:6/TB7-F:TB10';
  let sets = parseScoreString({ scoreString, matchUpFormat });

  // Set 1: TB7
  expect(sets[0].side1Score).toEqual(7);
  expect(sets[0].side2Score).toEqual(6);
  expect(sets[0].side1TiebreakScore).toEqual(7);
  expect(sets[0].side2TiebreakScore).toEqual(3);

  // Set 2: TB7
  expect(sets[1].side1Score).toEqual(6);
  expect(sets[1].side2Score).toEqual(7);
  expect(sets[1].side1TiebreakScore).toEqual(4);
  expect(sets[1].side2TiebreakScore).toEqual(7);

  // Set 3: TB10 (tiebreak-only) — its points are tiebreak points, with or without the format (G3)
  expect(sets[2].side1Score).toEqual(undefined);
  expect(sets[2].side2Score).toEqual(undefined);
  expect(sets[2].side1TiebreakScore).toEqual(11);
  expect(sets[2].side2TiebreakScore).toEqual(9);
  expect(sets[2].tiebreakSet).toBe(true);
});

it('uses default TB7 when no matchUpFormat provided', () => {
  // Without matchUpFormat, should default to TB7
  const scoreString = '7-6(3)';
  let sets = parseScoreString({ scoreString });
  expect(sets[0].side1Score).toEqual(7);
  expect(sets[0].side2Score).toEqual(6);
  expect(sets[0].side1TiebreakScore).toEqual(7);
  expect(sets[0].side2TiebreakScore).toEqual(3);

  // With explicit tiebreakTo parameter (legacy)
  sets = parseScoreString({ scoreString, tiebreakTo: 10 });
  expect(sets[0].side1Score).toEqual(7);
  expect(sets[0].side2Score).toEqual(6);
  expect(sets[0].side1TiebreakScore).toEqual(10);
  expect(sets[0].side2TiebreakScore).toEqual(3);
});

describe('TB1 NoAD support', () => {
  it('should set NoAD=true for TB1 tiebreak-only final set', () => {
    const format = 'SET3XA-S:T10-F:TB1';
    const scoreString = '30-25 25-30 [1-0]';
    const result = parseScoreString({ scoreString, matchUpFormat: format });

    expect(result.length).toEqual(3);

    // First two sets are timed (no brackets)
    expect(result[0].side1Score).toEqual(30);
    expect(result[0].side2Score).toEqual(25);
    expect(result[0].NoAD).toBeUndefined();
    expect(result[0].tiebreakSet).toBeUndefined();

    expect(result[1].side1Score).toEqual(25);
    expect(result[1].side2Score).toEqual(30);
    expect(result[1].NoAD).toBeUndefined();
    expect(result[1].tiebreakSet).toBeUndefined();

    // Final set is TB1 (tiebreak-only): the point is a tiebreak point, not a game
    expect(result[2].side1TiebreakScore).toEqual(1);
    expect(result[2].side2TiebreakScore).toEqual(0);
    expect(result[2].side1Score).toBeUndefined();
    expect(result[2].NoAD).toBe(true);
    expect(result[2].tiebreakSet).toBe(true);
  });

  it('should set NoAD=true for TB1NOAD tiebreak-only final set', () => {
    const format = 'SET3XA-S:T10-F:TB1NOAD';
    const scoreString = '40-35 30-35 [1-0]';
    const result = parseScoreString({ scoreString, matchUpFormat: format });

    expect(result.length).toEqual(3);

    // Final set should have NoAD=true
    expect(result[2].side1TiebreakScore).toEqual(1);
    expect(result[2].side2TiebreakScore).toEqual(0);
    expect(result[2].NoAD).toBe(true);
    expect(result[2].tiebreakSet).toBe(true);
  });

  it('should NOT set NoAD for TB7 tiebreak-only sets', () => {
    const format = 'SET3-S:TB7';
    const scoreString = '[7-5] [5-7] [7-6]';
    const result = parseScoreString({ scoreString, matchUpFormat: format });

    expect(result.length).toEqual(3);

    // TB7 should have tiebreakSet=true but NoAD should be undefined
    expect(result[0].side1TiebreakScore).toEqual(7);
    expect(result[0].side2TiebreakScore).toEqual(5);
    expect(result[0].tiebreakSet).toBe(true);
    expect(result[0].NoAD).toBeUndefined();
  });

  it('should NOT set NoAD for TB10 tiebreak-only sets', () => {
    const format = 'SET3-S:TB10';
    const scoreString = '[10-8] [8-10] [10-7]';
    const result = parseScoreString({ scoreString, matchUpFormat: format });

    expect(result.length).toEqual(3);

    // TB10 should have tiebreakSet=true but NoAD should be undefined
    expect(result[0].side1TiebreakScore).toEqual(10);
    expect(result[0].side2TiebreakScore).toEqual(8);
    expect(result[0].tiebreakSet).toBe(true);
    expect(result[0].NoAD).toBeUndefined();
  });

  it('should set NoAD=true for all sets in SET3-S:TB1', () => {
    const format = 'SET3-S:TB1';
    const scoreString = '[1-0] [0-1] [1-0]';
    const result = parseScoreString({ scoreString, matchUpFormat: format });

    expect(result.length).toEqual(3);

    // All sets should have NoAD=true since all are TB1
    result.forEach((set) => {
      expect(set.tiebreakSet).toBe(true);
      expect(set.NoAD).toBe(true);
    });
  });
});

// ============================================================================
// ADDITIONAL EDGE CASE TESTS FOR FULL COVERAGE
// ============================================================================

describe('parseScoreString - Edge Cases', () => {
  it('should handle empty/whitespace strings gracefully', () => {
    let result = parseScoreString({ scoreString: '' });
    expect(result).toEqual([]);

    result = parseScoreString({ scoreString: '   ' });
    expect(result.length).toEqual(0);
  });

  it('should handle scores with extra whitespace', () => {
    const scoreString = '  6-4   6-3  ';
    const result = parseScoreString({ scoreString });
    expect(result.length).toEqual(2);
    expect(result[0].side1Score).toEqual(6);
    expect(result[0].side2Score).toEqual(4);
    expect(result[1].side1Score).toEqual(6);
    expect(result[1].side2Score).toEqual(3);
  });

  it('should handle pro set scores', () => {
    let result = parseScoreString({ scoreString: '8-5' });
    expect(result.length).toEqual(1);
    expect(result[0].side1Score).toEqual(8);
    expect(result[0].side2Score).toEqual(5);
    expect(result[0].winningSide).toEqual(1);

    result = parseScoreString({ scoreString: '10-8' });
    expect(result[0].side1Score).toEqual(10);
    expect(result[0].side2Score).toEqual(8);
  });

  it('should handle best-of-5 matches', () => {
    const scoreString = '6-4 3-6 6-7(5) 7-6(3) 6-3';
    const result = parseScoreString({ scoreString });
    expect(result.length).toEqual(5);

    expect(result[0].winningSide).toEqual(1);
    expect(result[1].winningSide).toEqual(2);
    expect(result[2].winningSide).toEqual(2);
    expect(result[3].winningSide).toEqual(1);
    expect(result[4].winningSide).toEqual(1);
  });

  it('should handle super tiebreak as deciding set', () => {
    const scoreString = '6-4 3-6 10-8';
    const result = parseScoreString({ scoreString });
    expect(result.length).toEqual(3);
    expect(result[2].side1Score).toEqual(10);
    expect(result[2].side2Score).toEqual(8);
    expect(result[2].winningSide).toEqual(1);
  });

  it('should handle single set match', () => {
    const scoreString = '6-4';
    const result = parseScoreString({ scoreString });
    expect(result.length).toEqual(1);
    expect(result[0].side1Score).toEqual(6);
    expect(result[0].side2Score).toEqual(4);
    expect(result[0].winningSide).toEqual(1);
  });

  it('should handle malformed format gracefully', () => {
    // Test with invalid matchUpFormat - should not crash
    const scoreString = '6-4 6-3';
    const result = parseScoreString({
      scoreString,
      matchUpFormat: 'INVALID_FORMAT',
    });
    expect(result.length).toEqual(2);
    expect(result[0].side1Score).toEqual(6);
  });

  it('should handle mixed bracket styles in scoreString', () => {
    // Parentheses for set tiebreak, brackets for match tiebreak
    const scoreString = '7-6(5) 6-7(3) [10-8]';
    const result = parseScoreString({ scoreString });
    expect(result.length).toEqual(3);

    expect(result[0].side1TiebreakScore).toEqual(7);
    expect(result[0].side2TiebreakScore).toEqual(5);

    expect(result[1].side1TiebreakScore).toEqual(3);
    expect(result[1].side2TiebreakScore).toEqual(7);

    expect(result[2].side1TiebreakScore).toEqual(10);
    expect(result[2].side2TiebreakScore).toEqual(8);
  });

  it('should parse complex SET5 format', () => {
    const format = 'SET5-S:6/TB7';
    const scoreString = '6-4 3-6 6-7(3) 7-6(5) 6-3';
    const result = parseScoreString({ scoreString, matchUpFormat: format });

    expect(result.length).toEqual(5);
    expect(result[2].side1TiebreakScore).toEqual(3);
    expect(result[2].side2TiebreakScore).toEqual(7);
    expect(result[3].side1TiebreakScore).toEqual(7);
    expect(result[3].side2TiebreakScore).toEqual(5);
  });

  it('should correctly determine winningSide for all scenarios', () => {
    // Side 1 wins
    let result = parseScoreString({ scoreString: '6-4' });
    expect(result[0].winningSide).toEqual(1);

    // Side 2 wins
    result = parseScoreString({ scoreString: '4-6' });
    expect(result[0].winningSide).toEqual(2);

    // Equal scores (no winner - edge case)
    result = parseScoreString({ scoreString: '3-3' });
    expect(result[0].winningSide).toBeUndefined();
  });

  it('should handle tiebreak complements correctly for different tiebreakTo values', () => {
    // Test various tiebreakTo values with different score scenarios
    const testCases = [
      { format: 'SET3-S:6/TB7', score: '7-6(5)', expected: { s1: 7, s2: 5 } },
      { format: 'SET3-S:6/TB9', score: '4-5(3)', expected: { s1: 3, s2: 9 } },
      { format: 'SET3-S:6/TB10', score: '7-6(8)', expected: { s1: 10, s2: 8 } },
      { format: 'SET3-S:6/TB12', score: '6-7(10)', expected: { s1: 10, s2: 12 } },
    ];

    testCases.forEach(({ format, score, expected }) => {
      const result = parseScoreString({ scoreString: score, matchUpFormat: format });
      expect(result[0].side1TiebreakScore).toEqual(expected.s1);
      expect(result[0].side2TiebreakScore).toEqual(expected.s2);
    });
  });

  it('should handle undefined matchUpFormat and use default tiebreakTo', () => {
    const scoreString = '7-6(5)';
    const result = parseScoreString({ scoreString });

    expect(result[0].side1TiebreakScore).toEqual(7);
    expect(result[0].side2TiebreakScore).toEqual(5);
  });

  it('should handle SET formats with different bestOf values', () => {
    // SET1 format (best-of-1)
    let result = parseScoreString({
      scoreString: '[10-8]',
      matchUpFormat: 'SET1-S:TB10',
    });
    expect(result.length).toEqual(1);
    expect(result[0].tiebreakSet).toBe(true);

    // SET5 format (best-of-5)
    result = parseScoreString({
      scoreString: '6-4 3-6 6-3 2-6 6-4',
      matchUpFormat: 'SET5-S:6/TB7',
    });
    expect(result.length).toEqual(5);
  });
});
