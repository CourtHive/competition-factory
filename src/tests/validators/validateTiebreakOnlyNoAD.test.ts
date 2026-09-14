/**
 * Tests for NoAD tiebreak-only formats
 * Covers TB10NOAD, TB7NOAD, TB1NOAD
 */
import { validateSetScore, validateMatchUpScore } from '@Validators/validateMatchUpScore';
import { describe, it, expect } from 'vitest';

// constants
import { COMPLETED } from '@Constants/matchUpStatusConstants';

describe('validateSetScore - TB10NOAD (tiebreak-only, NoAD)', () => {
  const tb10NoadFormat = 'SET3-S:TB10NOAD';

  describe('Valid TB10NOAD scores', () => {
    it('should accept 10-9 (win by 1 is valid for NoAD)', () => {
      const set = { side1Score: 10, side2Score: 9 };
      const result = validateSetScore(set, tb10NoadFormat);
      expect(result.isValid).toBe(true);
    });

    it('should accept 11-10 (extended, win by 1)', () => {
      const set = { side1Score: 11, side2Score: 10 };
      const result = validateSetScore(set, tb10NoadFormat);
      expect(result.isValid).toBe(true);
    });

    it('should accept 12-11 (further extended, win by 1)', () => {
      const set = { side1Score: 12, side2Score: 11 };
      const result = validateSetScore(set, tb10NoadFormat);
      expect(result.isValid).toBe(true);
    });

    it('should accept 10-8 (win by 2 also valid)', () => {
      const set = { side1Score: 10, side2Score: 8 };
      const result = validateSetScore(set, tb10NoadFormat);
      expect(result.isValid).toBe(true);
    });

    it('should accept 10-0 (one-sided)', () => {
      const set = { side1Score: 10, side2Score: 0 };
      const result = validateSetScore(set, tb10NoadFormat);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Invalid TB10NOAD scores', () => {
    it('should reject 9-8 (neither at 10)', () => {
      const set = { side1Score: 9, side2Score: 8 };
      const result = validateSetScore(set, tb10NoadFormat);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must reach at least 10');
    });

    it('should reject 10-10 (tied)', () => {
      const set = { side1Score: 10, side2Score: 10 };
      const result = validateSetScore(set, tb10NoadFormat);
      expect(result.isValid).toBe(false);
    });

    it('should reject 0-0 (no scores)', () => {
      const set = { side1Score: 0, side2Score: 0 };
      const result = validateSetScore(set, tb10NoadFormat);
      expect(result.isValid).toBe(false);
    });
  });
});

describe('validateSetScore - TB7NOAD (tiebreak-only, NoAD)', () => {
  const tb7NoadFormat = 'SET3-S:TB7NOAD';

  it('should accept 7-6 (win by 1 for NoAD)', () => {
    const set = { side1Score: 7, side2Score: 6 };
    const result = validateSetScore(set, tb7NoadFormat);
    expect(result.isValid).toBe(true);
  });

  it('should accept 8-7 (extended, win by 1)', () => {
    const set = { side1Score: 8, side2Score: 7 };
    const result = validateSetScore(set, tb7NoadFormat);
    expect(result.isValid).toBe(true);
  });

  it('should accept 7-5 (win by 2 also valid)', () => {
    const set = { side1Score: 7, side2Score: 5 };
    const result = validateSetScore(set, tb7NoadFormat);
    expect(result.isValid).toBe(true);
  });

  it('should reject 6-5 (neither at 7)', () => {
    const set = { side1Score: 6, side2Score: 5 };
    const result = validateSetScore(set, tb7NoadFormat);
    expect(result.isValid).toBe(false);
    expect(result.error).toContain('must reach at least 7');
  });
});

describe('validateSetScore - TB1NOAD (tiebreak-only to 1, NoAD)', () => {
  const tb1NoadFormat = 'SET3-S:TB1NOAD';

  it('should accept 1-0', () => {
    const set = { side1Score: 1, side2Score: 0 };
    const result = validateSetScore(set, tb1NoadFormat);
    expect(result.isValid).toBe(true);
  });

  it('should accept 0-1', () => {
    const set = { side1Score: 0, side2Score: 1 };
    const result = validateSetScore(set, tb1NoadFormat);
    expect(result.isValid).toBe(true);
  });

  it('should reject 0-0 (tied)', () => {
    const set = { side1Score: 0, side2Score: 0 };
    const result = validateSetScore(set, tb1NoadFormat);
    expect(result.isValid).toBe(false);
  });

  it('should reject 1-1 (tied)', () => {
    const set = { side1Score: 1, side2Score: 1 };
    const result = validateSetScore(set, tb1NoadFormat);
    expect(result.isValid).toBe(false);
  });

  it('should accept 2-1 (extended beyond tiebreakTo)', () => {
    // TB1NOAD may allow scores beyond 1 if game continues
    const set = { side1Score: 2, side2Score: 1 };
    const result = validateSetScore(set, tb1NoadFormat);
    // Current implementation may accept this
    expect(result.isValid).toBe(true);
  });
});

describe('validateMatchUpScore - TB1NOAD final set with aggregate', () => {
  const format = 'SET3XA-S:T10-F:TB1NOAD';

  it('should accept aggregate tie resolved by TB1NOAD final set', () => {
    const sets = [
      { side1Score: 30, side2Score: 25, setNumber: 1 },
      { side1Score: 25, side2Score: 30, setNumber: 2 },
      { side1Score: 1, side2Score: 0, setNumber: 3 }, // TB1NOAD
    ];

    const result = validateMatchUpScore(sets, format, COMPLETED);
    expect(result.isValid).toBe(true);
  });

  it('should accept 3 sets with TB1NOAD when aggregate tied', () => {
    const sets = [
      { side1Score: 40, side2Score: 35, setNumber: 1 },
      { side1Score: 30, side2Score: 35, setNumber: 2 },
      { side1Score: 0, side2Score: 1, setNumber: 3 }, // TB1NOAD side 2 wins
    ];

    const result = validateMatchUpScore(sets, format, COMPLETED);
    expect(result.isValid).toBe(true);
  });
});

describe('validateMatchUpScore - SET3-S:TB10NOAD full match', () => {
  const format = 'SET3-S:TB10NOAD';

  it('should accept best of 3 with TB10NOAD sets won by 1', () => {
    const sets = [
      { side1Score: 10, side2Score: 9, setNumber: 1 },
      { side1Score: 9, side2Score: 10, setNumber: 2 },
      { side1Score: 10, side2Score: 8, setNumber: 3 },
    ];

    const result = validateMatchUpScore(sets, format, COMPLETED);
    expect(result.isValid).toBe(true);
  });

  it('should accept 2-0 victory', () => {
    const sets = [
      { side1Score: 10, side2Score: 7, setNumber: 1 },
      { side1Score: 11, side2Score: 10, setNumber: 2 }, // Extended, win by 1
    ];

    const result = validateMatchUpScore(sets, format, COMPLETED);
    expect(result.isValid).toBe(true);
  });
});
