import { deduceMatchUpFormat } from '@Query/scoring/deduceMatchUpFormat';
import { describe, expect, it } from 'vitest';

const DEFAULT_FORMAT = 'SET3-S:6/TB7';

// ============================================================================
// Edge cases and empty input
// ============================================================================
describe('deduceMatchUpFormat', () => {
  it('returns default format for empty string', () => {
    expect(deduceMatchUpFormat('')).toBe(DEFAULT_FORMAT);
  });

  it('returns default format for whitespace-only string', () => {
    expect(deduceMatchUpFormat('   ')).toBe(DEFAULT_FORMAT);
  });

  // ============================================================================
  // bestOf detection from number of sets
  // ============================================================================
  describe('bestOf detection', () => {
    it('deduces bestOf 1 for single set', () => {
      expect(deduceMatchUpFormat('6-4')).toBe('SET1-S:6/TB7');
    });

    it('deduces bestOf 3 for two sets', () => {
      expect(deduceMatchUpFormat('6-4 6-2')).toBe('SET3-S:6/TB7');
    });

    it('deduces bestOf 5 for three sets', () => {
      expect(deduceMatchUpFormat('6-4 4-6 7-5')).toBe('SET5-S:6/TB7');
    });

    it('deduces bestOf 5 for four sets', () => {
      expect(deduceMatchUpFormat('6-4 4-6 6-3 7-5')).toBe('SET5-S:6/TB7');
    });

    it('deduces bestOf 5 for five sets', () => {
      expect(deduceMatchUpFormat('6-4 4-6 6-3 3-6 7-5')).toBe('SET5-S:6/TB7');
    });
  });

  // ============================================================================
  // Match tiebreak detection (S:TB10)
  // ============================================================================
  describe('match tiebreak detection', () => {
    it('detects match tiebreak when max score is 10', () => {
      expect(deduceMatchUpFormat('10-8')).toBe('SET1-S:TB10');
    });

    it('detects match tiebreak in multi-set with tiebreak final', () => {
      expect(deduceMatchUpFormat('6-4 4-6 10-5')).toBe('SET5-S:TB10');
    });

    it('detects match tiebreak when max > 10 and diff <= 2', () => {
      expect(deduceMatchUpFormat('11-9')).toBe('SET1-S:TB10');
      expect(deduceMatchUpFormat('12-10')).toBe('SET1-S:TB10');
    });

    it('does not detect match tiebreak when max > 10 and diff > 2', () => {
      // 11-5 → max=11, diff=6 → not a tiebreak
      expect(deduceMatchUpFormat('11-5')).not.toContain('TB10');
    });
  });

  // ============================================================================
  // Tiebreak notation → setTo deduction
  // ============================================================================
  describe('tiebreak notation deduction', () => {
    it('deduces setTo 6 from 7-6(5) tiebreak notation', () => {
      expect(deduceMatchUpFormat('7-6(5)')).toBe('SET1-S:6/TB7');
    });

    it('deduces setTo 6 from 6-7(3) tiebreak notation', () => {
      expect(deduceMatchUpFormat('6-7(3)')).toBe('SET1-S:6/TB7');
    });

    it('deduces setTo 6 in multi-set match with tiebreak', () => {
      expect(deduceMatchUpFormat('7-6(5) 6-4')).toBe('SET3-S:6/TB7');
    });

    it('deduces setTo from short set tiebreak (4-3)', () => {
      // 4-3(7) → maxGames=4, minGames=3, diff=1 → setTo=3
      expect(deduceMatchUpFormat('4-3(7) 3-4(5) 4-2')).toBe('SET5-S:3/TB7');
    });

    it('handles tiebreak where maxGames !== minGames + 1 (fallback)', () => {
      // Edge case: score like 8-6(5) — maxGames=8, minGames=6, diff=2
      // Falls to fallback: setTo = maxGames - 1 = 7
      expect(deduceMatchUpFormat('8-6(5)')).toBe('SET1-S:7/TB7');
    });

    it('returns default when tiebreak set has no parseable game scores', () => {
      // Malformed: just parentheses with no digits before
      expect(deduceMatchUpFormat('(5)')).toBe(DEFAULT_FORMAT);
    });
  });

  // ============================================================================
  // No tiebreak → game score deduction
  // ============================================================================
  describe('game score deduction (no tiebreak notation)', () => {
    it('deduces setTo 6 from standard scores', () => {
      expect(deduceMatchUpFormat('6-4 6-2')).toBe('SET3-S:6/TB7');
    });

    it('deduces setTo 6 when any set has 7 games', () => {
      expect(deduceMatchUpFormat('7-5 6-3')).toBe('SET3-S:6/TB7');
    });

    it('deduces setTo 4 when all sets below 6', () => {
      expect(deduceMatchUpFormat('4-2 4-1')).toBe('SET3-S:4/TB7');
    });

    it('deduces setTo 5 when max game is 5', () => {
      expect(deduceMatchUpFormat('5-3 5-2')).toBe('SET3-S:5/TB7');
    });

    it('deduces setTo 3 when all sets are very short', () => {
      expect(deduceMatchUpFormat('3-1 3-2')).toBe('SET3-S:3/TB7');
    });

    it('returns default when no game scores parseable', () => {
      // Scores with no digits (edge case)
      expect(deduceMatchUpFormat('abc def')).toBe(DEFAULT_FORMAT);
    });
  });

  // ============================================================================
  // Final set advantage detection
  // ============================================================================
  describe('final set advantage', () => {
    it('detects advantage final set (8-6)', () => {
      expect(deduceMatchUpFormat('6-4 4-6 8-6')).toBe('SET5-S:6/TB7-F:6');
    });

    it('detects advantage final set (9-7)', () => {
      expect(deduceMatchUpFormat('6-4 4-6 9-7')).toBe('SET5-S:6/TB7-F:6');
    });

    it('detects 13-11 as match tiebreak (tiebreak detection runs first)', () => {
      // 13-11: max=13 > 10 && diff=2 <= 2 → match tiebreak detection fires
      expect(deduceMatchUpFormat('6-3 3-6 13-11')).toBe('SET5-S:TB10');
    });

    it('does not detect advantage for 2-set match (no deciding set)', () => {
      // 2 sets = straight-set win, no deciding set possible
      expect(deduceMatchUpFormat('6-4 6-2')).toBe('SET3-S:6/TB7');
    });

    it('does not detect advantage when diff is not 2', () => {
      // 8-5 → maxGames=8, minGames=5, diff=3 (not advantage)
      expect(deduceMatchUpFormat('6-4 4-6 8-5')).toBe('SET5-S:6/TB7');
    });

    it('does not detect advantage when last set is at setTo+1', () => {
      // 7-5 → maxGames=7, setTo=6, maxGames = setTo+1, not > setTo+1
      expect(deduceMatchUpFormat('6-4 4-6 7-5')).toBe('SET5-S:6/TB7');
    });

    it('deduces setTo=6 when advantage set has 6+ games (overrides short set deduction)', () => {
      // Last set 6-4: overallMax=6 → setTo=6, maxGames=6 = setTo+1-1, not advantage
      expect(deduceMatchUpFormat('4-2 2-4 6-4')).toBe('SET5-S:6/TB7');
    });

    it('handles 5-set match with advantage final', () => {
      expect(deduceMatchUpFormat('5-7 4-6 6-3 7-6(5) 8-6')).toBe('SET5-S:6/TB7-F:6');
    });
  });

  // ============================================================================
  // Format string building
  // ============================================================================
  describe('format string building', () => {
    it('builds SET-S:6/TB7 for standard tennis', () => {
      expect(deduceMatchUpFormat('6-4 6-2')).toBe('SET3-S:6/TB7');
    });

    it('builds SET-S:4/TB7 for short set', () => {
      expect(deduceMatchUpFormat('4-2 4-1')).toBe('SET3-S:4/TB7');
    });

    it('detects 11-10 as match tiebreak (tiebreak detection runs first)', () => {
      // 11-10: max=11 > 10 && diff=1 <= 2 → match tiebreak detection fires
      expect(deduceMatchUpFormat('11-10(5)')).toBe('SET1-S:TB10');
    });

    it('builds generic SET-S:{n}/TB7 for other setTo values', () => {
      // setTo=3 from tiebreak: 4-3(5)
      expect(deduceMatchUpFormat('4-3(5)')).toBe('SET1-S:3/TB7');
    });

    it('builds generic SET-S:{n}/TB7 for setTo=5 via tiebreak', () => {
      // 6-5(7) → maxGames=6, minGames=5, diff=1 → setTo=5
      expect(deduceMatchUpFormat('6-5(7)')).toBe('SET1-S:5/TB7');
    });
  });

  // ============================================================================
  // Edge cases in final set parsing
  // ============================================================================
  describe('final set edge cases', () => {
    it('handles last set with no parseable game scores', () => {
      // 3 "sets" but last has no digits → gameScores regex returns null, falls to || []
      expect(deduceMatchUpFormat('6-4 4-6 abc')).toBe('SET5-S:6/TB7');
    });

    it('handles last set with only one game score', () => {
      // gameScores.length !== 2 → no advantage detection
      expect(deduceMatchUpFormat('6-4 4-6 7')).toBe('SET5-S:6/TB7');
    });
  });

  // ============================================================================
  // Comma-separated scores
  // ============================================================================
  describe('score format flexibility', () => {
    it('handles comma-separated scores', () => {
      expect(deduceMatchUpFormat('6-4,6-2')).toBe('SET3-S:6/TB7');
    });

    it('handles mixed space and comma separators', () => {
      expect(deduceMatchUpFormat('6-4, 6-2')).toBe('SET3-S:6/TB7');
    });
  });
});
