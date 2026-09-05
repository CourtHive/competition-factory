/**
 * Tests for validateSetScore with NoAD property from parsed sets
 *
 * Tests the fix where validateSetScore checks set.NoAD property
 * that was set by parseScoreString, not just the format's NoAD
 */
import { describe, it, expect } from 'vitest';
import { validateSetScore } from '@Validators/validateMatchUpScore';

describe('validateSetScore - NoAD property from parseScoreString', () => {
  describe('TB1 tiebreak-only sets with NoAD property', () => {
    it('should accept 1-0 when set.NoAD=true (from parseScoreString)', () => {
      const format = 'SET3XA-S:T10-F:TB1';
      const set = {
        side1Score: 1,
        side2Score: 0,
        setNumber: 3,
        NoAD: true, // Set by parseScoreString
        tiebreakSet: true,
      };

      const result = validateSetScore(set, format, true, false);
      expect(result.isValid).toBe(true);
    });

    it('should accept 0-1 when set.NoAD=true', () => {
      const format = 'SET3XA-S:T10-F:TB1';
      const set = {
        side1Score: 0,
        side2Score: 1,
        setNumber: 3,
        NoAD: true,
        tiebreakSet: true,
      };

      const result = validateSetScore(set, format, true, false);
      expect(result.isValid).toBe(true);
    });

    it('should reject 1-0 for TB10 when set.NoAD is not set (score too low)', () => {
      const format = 'SET3-S:TB10'; // Regular TB10, not TB1
      const set = {
        side1Score: 1,
        side2Score: 0,
        setNumber: 1,
        tiebreakSet: true,
        // NoAD is undefined
      };

      const result = validateSetScore(set, format, false, false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must reach at least 10');
    });

    it('should accept 2-1 when set.NoAD=true (extended)', () => {
      const format = 'SET3-S:TB1';
      const set = {
        side1Score: 2,
        side2Score: 1,
        setNumber: 1,
        NoAD: true,
        tiebreakSet: true,
      };

      const result = validateSetScore(set, format, false, false);
      expect(result.isValid).toBe(true);
    });
  });

  describe('TB1NOAD format variations', () => {
    it('should accept 1-0 for TB1NOAD final set', () => {
      const format = 'SET3XA-S:T10-F:TB1NOAD';
      const set = {
        side1Score: 1,
        side2Score: 0,
        setNumber: 3,
        NoAD: true,
        tiebreakSet: true,
      };

      const result = validateSetScore(set, format, true, false);
      expect(result.isValid).toBe(true);
    });

    it('should accept 1-0 for all sets in SET3-S:TB1NOAD', () => {
      const format = 'SET3-S:TB1NOAD';

      for (let setNumber = 1; setNumber <= 3; setNumber++) {
        const set = {
          side1Score: setNumber % 2 === 1 ? 1 : 0,
          side2Score: setNumber % 2 === 1 ? 0 : 1,
          setNumber,
          NoAD: true,
          tiebreakSet: true,
        };

        const result = validateSetScore(set, format, false, false);
        expect(result.isValid).toBe(true);
      }
    });
  });

  describe('Negative tests - ensure NoAD is required for 1-point margins', () => {
    it('should reject 10-9 for TB10 without NoAD', () => {
      const format = 'SET3-S:TB10';
      const set = {
        side1Score: 10,
        side2Score: 9,
        setNumber: 1,
        tiebreakSet: true,
        // NoAD is undefined
      };

      const result = validateSetScore(set, format, false, false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must be won by at least 2 points');
    });

    it('should accept 10-9 for TB10 when set.NoAD=true', () => {
      const format = 'SET3-S:TB10';
      const set = {
        side1Score: 10,
        side2Score: 9,
        setNumber: 1,
        NoAD: true, // Explicitly set
        tiebreakSet: true,
      };

      const result = validateSetScore(set, format, false, false);
      expect(result.isValid).toBe(true);
    });

    it('should reject 7-6 for TB7 without NoAD', () => {
      const format = 'SET3-S:TB7';
      const set = {
        side1Score: 7,
        side2Score: 6,
        setNumber: 1,
        tiebreakSet: true,
        // NoAD is undefined
      };

      const result = validateSetScore(set, format, false, false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must be won by at least 2 points');
    });

    it('should accept 7-6 for TB7 when set.NoAD=true', () => {
      const format = 'SET3-S:TB7';
      const set = {
        side1Score: 7,
        side2Score: 6,
        setNumber: 1,
        NoAD: true,
        tiebreakSet: true,
      };

      const result = validateSetScore(set, format, false, false);
      expect(result.isValid).toBe(true);
    });
  });

  describe('Format NoAD fallback (backward compatibility)', () => {
    it('should use format NoAD when set.NoAD is undefined', () => {
      // This tests that the format's NoAD still works for backward compatibility
      const format = 'SET3-S:TB7NOAD';
      const set = {
        side1Score: 7,
        side2Score: 6,
        setNumber: 1,
        tiebreakSet: true,
        // NoAD is undefined on set, should fall back to format
      };

      // Note: This will only work if the format itself has NoAD in tiebreakSet
      // For now, this documents the expected behavior
      const result = validateSetScore(set, format, false, false);

      // The format parser should set NoAD on the format
      // If not, this will fail and that's okay - it shows we need format-level support
      expect(result.isValid).toBe(true);
    });
  });

  describe('Edge cases', () => {
    it('should handle set.NoAD=false explicitly (should require win by 2)', () => {
      const format = 'SET3-S:TB10';
      const set = {
        side1Score: 10,
        side2Score: 9,
        setNumber: 1,
        NoAD: false, // Explicitly false
        tiebreakSet: true,
      };

      const result = validateSetScore(set, format, false, false);
      expect(result.isValid).toBe(false);
      expect(result.error).toContain('must be won by at least 2 points');
    });

    it('should accept 2-point margin with NoAD=true', () => {
      const format = 'SET3-S:TB1';
      const set = {
        side1Score: 3,
        side2Score: 1,
        setNumber: 1,
        NoAD: true,
        tiebreakSet: true,
      };

      const result = validateSetScore(set, format, false, false);
      expect(result.isValid).toBe(true);
    });

    it('should handle allowIncomplete=true (should skip validation)', () => {
      const format = 'SET3-S:TB10';
      const set = {
        side1Score: 5,
        side2Score: 4,
        setNumber: 1,
        tiebreakSet: true,
        // NoAD is undefined, score is incomplete
      };

      const result = validateSetScore(set, format, false, true);
      expect(result.isValid).toBe(true); // allowIncomplete=true skips validation
    });
  });
});

describe('validateSetScore - Integration with parseScoreString flow', () => {
  it('should validate a complete parsed TB1 set', () => {
    // This simulates what parseScoreString returns
    const format = 'SET3XA-S:T10-F:TB1';
    const parsedSet = {
      side1Score: 1,
      side2Score: 0,
      side1TiebreakScore: undefined,
      side2TiebreakScore: undefined,
      winningSide: 1,
      setNumber: 3,
      NoAD: true,
      tiebreakSet: true,
    };

    const result = validateSetScore(parsedSet, format, true, false);
    expect(result.isValid).toBe(true);
  });

  it('should validate all sets from a complete TB1NOAD match', () => {
    const format = 'SET3-S:TB1NOAD';
    const parsedSets = [
      {
        side1Score: 1,
        side2Score: 0,
        winningSide: 1,
        setNumber: 1,
        NoAD: true,
        tiebreakSet: true,
      },
      {
        side1Score: 0,
        side2Score: 1,
        winningSide: 2,
        setNumber: 2,
        NoAD: true,
        tiebreakSet: true,
      },
      {
        side1Score: 1,
        side2Score: 0,
        winningSide: 1,
        setNumber: 3,
        NoAD: true,
        tiebreakSet: true,
      },
    ];

    parsedSets.forEach((set) => {
      const result = validateSetScore(set, format, false, false);
      expect(result.isValid).toBe(true);
    });
  });
});
