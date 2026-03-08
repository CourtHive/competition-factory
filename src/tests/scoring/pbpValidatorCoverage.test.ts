/**
 * pbpValidator - Coverage improvement tests
 *
 * Targets uncovered branches in:
 * - No format provided, no expected score (default format with warning)
 * - Debug mode paths (console.log for format deduction, point processing, errors)
 * - Empty/null/invalid points string
 * - Match already complete (rejected points)
 * - Error in addPoint (catch block with and without debug)
 * - No expected score provided (skip comparison)
 * - normalizeScoreString variations (whitespace, commas)
 * - Set detail extraction with/without tiebreaks
 */

import { pbpValidator } from '@Validators/scoring/pbpValidator';
import { describe, it, expect } from 'vitest';

describe('pbpValidator - Coverage Improvements', () => {
  // ==========================================================================
  // Default format when no format and no expected score
  // ==========================================================================
  describe('default format fallback', () => {
    it('should use default SET3-S:6/TB7 when no format and no expected score', () => {
      const result = pbpValidator({
        points: '0000',
      });
      expect(result.formatDeduced).toBe(true);
      expect(result.matchUpFormat).toBe('SET3-S:6/TB7');
      expect(result.warnings).toContain('No format provided, using default SET3-S:6/TB7');
    });
  });

  // ==========================================================================
  // Format deduction from expected score
  // ==========================================================================
  describe('format deduction from expected score', () => {
    it('should deduce format from expected score when no format provided', () => {
      const result = pbpValidator({
        points: '0'.repeat(24),
        expectedScore: '6-0',
      });
      expect(result.formatDeduced).toBe(true);
      expect(result.matchUpFormat).toBe('SET1-S:6/TB7');
    });

    it('should use provided format when given', () => {
      const result = pbpValidator({
        points: '0'.repeat(16),
        matchUpFormat: 'SET1-S:4/TB7',
      });
      expect(result.formatDeduced).toBe(false);
      expect(result.matchUpFormat).toBe('SET1-S:4/TB7');
    });
  });

  // ==========================================================================
  // Debug mode
  // ==========================================================================
  describe('debug mode', () => {
    it('should run with debug=true and format deduction', () => {
      const result = pbpValidator({
        points: '0'.repeat(24),
        expectedScore: '6-0',
        debug: true,
      });
      expect(result.valid).toBe(true);
    });

    it('should run with debug=true and default format', () => {
      const result = pbpValidator({
        points: '0000',
        debug: true,
      });
      expect(result.formatDeduced).toBe(true);
    });

    it('should log debug info for each point processed', () => {
      const result = pbpValidator({
        points: '0000',
        matchUpFormat: 'SET1-S:6/TB7',
        debug: true,
      });
      expect(result.pointsProcessed).toBe(4);
    });

    it('should log debug info for rejected points after match complete', () => {
      // 6-0 = 24 points, then extra points
      const result = pbpValidator({
        points: '0'.repeat(24) + '111',
        matchUpFormat: 'SET1-S:6/TB7',
        debug: true,
      });
      expect(result.pointsProcessed).toBe(24);
      expect(result.pointsRejected).toHaveLength(3);
    });

    it('should log debug info for errors', () => {
      const result = pbpValidator({
        points: '0'.repeat(100),
        matchUpFormat: 'INVALID',
        debug: true,
      });
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Empty/invalid point string
  // ==========================================================================
  describe('empty and invalid point strings', () => {
    it('should return error for empty point string', () => {
      const result = pbpValidator({
        points: '',
        matchUpFormat: 'SET1-S:6/TB7',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No valid points found in point string');
      expect(result.pointsProcessed).toBe(0);
    });

    it('should return error for point string with only invalid characters', () => {
      const result = pbpValidator({
        points: 'XYZABC',
        matchUpFormat: 'SET1-S:6/TB7',
      });
      expect(result.valid).toBe(false);
      expect(result.errors).toContain('No valid points found in point string');
    });

    it('should filter out invalid characters and process valid ones', () => {
      const result = pbpValidator({
        points: '0X1Y0Z1',
        matchUpFormat: 'SET1-S:6/TB7',
      });
      expect(result.pointsProcessed).toBe(4);
    });
  });

  // ==========================================================================
  // Match already complete
  // ==========================================================================
  describe('match completion and excess points', () => {
    it('should reject excess points when match complete and allowExtraPoints=false', () => {
      const result = pbpValidator({
        points: '0'.repeat(24) + '11111',
        matchUpFormat: 'SET1-S:6/TB7',
        allowExtraPoints: false,
      });
      expect(result.pointsProcessed).toBe(24);
      expect(result.pointsRejected).toHaveLength(5);
      expect(result.warnings.some((w) => w.includes('excess points'))).toBe(true);
    });

    it('should allow extra points when allowExtraPoints=true', () => {
      const result = pbpValidator({
        points: '0'.repeat(24) + '11111',
        matchUpFormat: 'SET1-S:6/TB7',
        allowExtraPoints: true,
      });
      // Extra points are allowed but may produce errors or not depending on implementation
      expect(result.pointsProcessed).toBeGreaterThanOrEqual(24);
    });
  });

  // ==========================================================================
  // Error handling in addPoint
  // ==========================================================================
  describe('addPoint error handling', () => {
    it('should catch errors from addPoint with invalid format', () => {
      const result = pbpValidator({
        points: '0011',
        matchUpFormat: 'INVALID',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.pointsRejected.length).toBeGreaterThan(0);
    });

    it('should catch errors from addPoint with debug enabled', () => {
      const result = pbpValidator({
        points: '0011',
        matchUpFormat: 'INVALID',
        debug: true,
      });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBeGreaterThan(0);
    });
  });

  // ==========================================================================
  // Score comparison
  // ==========================================================================
  describe('score comparison', () => {
    it('should skip score comparison when no expected score', () => {
      const result = pbpValidator({
        points: '0'.repeat(24),
        matchUpFormat: 'SET1-S:6/TB7',
      });
      // No expectedScore means no comparison
      expect(result.valid).toBe(true);
      expect(result.expectedScore).toBeUndefined();
    });

    it('should handle score normalization with spaces', () => {
      const result = pbpValidator({
        points: '0'.repeat(24) + '1'.repeat(24),
        expectedScore: '6-0,  0-6',
        matchUpFormat: 'SET3-S:6/TB7',
      });
      // Normalization should handle extra spaces
      expect(result.valid).toBe(true);
    });

    it('should detect score mismatch after normalization', () => {
      const result = pbpValidator({
        points: '0'.repeat(24),
        expectedScore: '6-4',
        matchUpFormat: 'SET1-S:6/TB7',
      });
      expect(result.valid).toBe(false);
      expect(result.errors.some((e) => e.includes('Score mismatch'))).toBe(true);
    });
  });

  // ==========================================================================
  // Set detail extraction
  // ==========================================================================
  describe('set detail extraction', () => {
    it('should extract set details without tiebreak', () => {
      const result = pbpValidator({
        points: '0'.repeat(24),
        matchUpFormat: 'SET1-S:6/TB7',
      });
      expect(result.sets).toHaveLength(1);
      expect(result.sets[0].games).toEqual([6, 0]);
      expect(result.sets[0].tiebreak).toBeUndefined();
      expect(result.sets[0].scoreString).toBe('6-0');
    });

    it('should extract set details with tiebreak (side1 wins)', () => {
      // Play to 6-6 then tiebreak
      let points = '';
      // 5 games for side 0
      points += '0'.repeat(20);
      // 6 games for side 1
      points += '1'.repeat(24);
      // 1 more game for side 0 (6-6)
      points += '0'.repeat(4);
      // Tiebreak: side 0 wins 7-3
      points += '1'.repeat(3) + '0'.repeat(7);

      const result = pbpValidator({
        points,
        matchUpFormat: 'SET1-S:6/TB7',
      });
      expect(result.sets).toHaveLength(1);
      expect(result.sets[0].tiebreak).toBeDefined();
      expect(result.sets[0].games).toEqual([7, 6]);
    });

    it('should extract set details with tiebreak (side2 wins)', () => {
      // Play to 6-6 then tiebreak where side 1 wins
      // Alternate games: 0 wins, 1 wins, etc to get to 6-6
      let points = '';
      for (let g = 0; g < 6; g++) {
        // Side 0 wins a game
        points += '0'.repeat(4);
        // Side 1 wins a game
        points += '1'.repeat(4);
      }
      // Now at 6-6, tiebreak: side 1 wins 7-3
      points += '0'.repeat(3) + '1'.repeat(7);

      const result = pbpValidator({
        points,
        matchUpFormat: 'SET1-S:6/TB7',
      });
      expect(result.sets).toHaveLength(1);
      const set = result.sets[0];
      expect(set.tiebreak).toBeDefined();
      // side2 wins tiebreak
      expect(set.games[1]).toBe(7);
      expect(set.games[0]).toBe(6);
    });
  });

  // ==========================================================================
  // Multi-set extraction
  // ==========================================================================
  describe('multi-set matches', () => {
    it('should handle 3-set match', () => {
      // Set 1: 6-0 (24 points)
      // Set 2: 0-6 (24 points)
      // Set 3: 6-0 (24 points)
      const points = '0'.repeat(24) + '1'.repeat(24) + '0'.repeat(24);

      const result = pbpValidator({
        points,
        matchUpFormat: 'SET3-S:6/TB7',
      });

      expect(result.sets).toHaveLength(3);
      expect(result.sets[0].games).toEqual([6, 0]);
      expect(result.sets[1].games).toEqual([0, 6]);
      expect(result.sets[2].games).toEqual([6, 0]);
    });
  });

  // ==========================================================================
  // Errors make result invalid
  // ==========================================================================
  describe('error accumulation', () => {
    it('should set valid=false when any errors exist', () => {
      const result = pbpValidator({
        points: '0'.repeat(24),
        expectedScore: '6-4', // Will produce score mismatch error
        matchUpFormat: 'SET1-S:6/TB7',
      });
      expect(result.valid).toBe(false);
    });

    it('should set valid=true when no errors exist and expected matches', () => {
      const result = pbpValidator({
        points: '0'.repeat(24),
        expectedScore: '6-0',
        matchUpFormat: 'SET1-S:6/TB7',
      });
      expect(result.valid).toBe(true);
      expect(result.errors).toHaveLength(0);
    });
  });
});
