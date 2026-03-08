/**
 * validateMatchUp - Coverage improvement tests
 *
 * Targets uncovered branches in:
 * - No matchUp provided
 * - No points in history (warning)
 * - Point processing errors (catch block)
 * - Set count mismatch
 * - Missing set in expected
 * - Tiebreak score comparisons (side1/side2)
 * - Score string mismatch
 * - No expectedScore provided
 * - getSetScoreString with various tiebreak/non-tiebreak combinations
 * - validateSet with tiebreak expectations
 */

import { validateMatchUp, getSetScoreString, validateSet } from '@Validators/scoring/validateMatchUp';
import { createMatchUp } from '@Mutate/scoring/createMatchUp';
import { addPoint } from '@Mutate/scoring/addPoint';
import type { MatchUp } from '@Types/scoring/types';
import { describe, it, expect } from 'vitest';

describe('validateMatchUp - Coverage Improvements', () => {
  // ==========================================================================
  // No matchUp provided
  // ==========================================================================
  describe('no matchUp provided', () => {
    it('should return isValid=false with error when matchUp is undefined', () => {
      const result = validateMatchUp({ matchUp: undefined as unknown as MatchUp });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No matchUp provided');
      expect(result.pointsProcessed).toBe(0);
      expect(result.pointsRejected).toBe(0);
      expect(result.actual.sets).toEqual([]);
      expect(result.actual.scoreString).toBe('');
    });

    it('should return isValid=false with error when matchUp is null', () => {
      const result = validateMatchUp({ matchUp: null as unknown as MatchUp });
      expect(result.isValid).toBe(false);
      expect(result.errors).toContain('No matchUp provided');
    });

    it('should include expectedScore in result when matchUp is missing', () => {
      const result = validateMatchUp({
        matchUp: undefined as unknown as MatchUp,
        expectedScore: {
          sets: [{ side1Score: 6, side2Score: 4 }],
          scoreString: '6-4',
        },
      });
      expect(result.expected.sets).toEqual([{ side1Score: 6, side2Score: 4 }]);
      expect(result.expected.scoreString).toBe('6-4');
    });
  });

  // ==========================================================================
  // No points in history
  // ==========================================================================
  describe('no points in history', () => {
    it('should warn when matchUp has no points', () => {
      const matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
      // Ensure history exists but is empty
      matchUp.history = { points: [] };

      const result = validateMatchUp({ matchUp });
      expect(result.warnings).toContain('No points found to validate');
      expect(result.pointsProcessed).toBe(0);
      expect(result.isValid).toBe(true); // No errors, just a warning
    });

    it('should warn when history is undefined', () => {
      const matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
      delete (matchUp as any).history;

      const result = validateMatchUp({ matchUp });
      expect(result.warnings).toContain('No points found to validate');
    });
  });

  // ==========================================================================
  // Point processing errors (catch block)
  // ==========================================================================
  describe('point processing errors', () => {
    it('should count rejected points and record errors', () => {
      const matchUp: MatchUp = {
        matchUpId: 'test',
        matchUpFormat: 'INVALID',
        matchUpStatus: 'TO_BE_PLAYED',
        matchUpType: 'SINGLES',
        sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
        score: { sets: [] },
        history: {
          points: [
            { pointNumber: 1, winner: 0 as const, timestamp: '' },
            { pointNumber: 2, winner: 1 as const, timestamp: '' },
          ],
        },
      };

      const result = validateMatchUp({ matchUp });
      expect(result.pointsRejected).toBeGreaterThan(0);
      expect(result.errors.length).toBeGreaterThan(0);
      expect(result.errors[0]).toContain('Point');
    });

    it('should use pointNumber from point when available in error message', () => {
      const matchUp: MatchUp = {
        matchUpId: 'test',
        matchUpFormat: 'INVALID',
        matchUpStatus: 'TO_BE_PLAYED',
        matchUpType: 'SINGLES',
        sides: [{ sideNumber: 1 }, { sideNumber: 2 }],
        score: { sets: [] },
        history: {
          points: [{ pointNumber: 42, winner: 0 as const, timestamp: '' }],
        },
      };

      const result = validateMatchUp({ matchUp });
      expect(result.errors.some((e) => e.includes('Point 42'))).toBe(true);
    });
  });

  // ==========================================================================
  // Expected score validation branches
  // ==========================================================================
  describe('expected score validation', () => {
    it('should detect set count mismatch', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
      // Play 1 set (6-0)
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) {
          matchUp = addPoint(matchUp, { winner: 0 });
        }
      }

      const result = validateMatchUp({
        matchUp,
        expectedScore: {
          sets: [
            { side1Score: 6, side2Score: 0 },
            { side1Score: 6, side2Score: 0 }, // Extra set in expectation
          ],
        },
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Set count mismatch'))).toBe(true);
    });

    it('should detect missing set when expected has more sets than actual', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET1-S:6/TB7' });
      // Play 1 set (6-0)
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) {
          matchUp = addPoint(matchUp, { winner: 0 });
        }
      }

      const result = validateMatchUp({
        matchUp,
        expectedScore: {
          sets: [
            { side1Score: 6, side2Score: 0 },
            { side1Score: 6, side2Score: 3 }, // This set doesn't exist
          ],
        },
      });

      expect(result.errors.some((e) => e.includes('Missing set 2'))).toBe(true);
    });

    it('should detect side1TiebreakScore mismatch', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET1-S:6/TB7' });
      // Play to 6-6
      for (let g = 0; g < 5; g++) {
        for (let p = 0; p < 4; p++) matchUp = addPoint(matchUp, { winner: 0 });
      }
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) matchUp = addPoint(matchUp, { winner: 1 });
      }
      for (let p = 0; p < 4; p++) matchUp = addPoint(matchUp, { winner: 0 });
      // Now at 6-6, play tiebreak 7-3
      for (let i = 0; i < 3; i++) matchUp = addPoint(matchUp, { winner: 1 });
      for (let i = 0; i < 7; i++) matchUp = addPoint(matchUp, { winner: 0 });

      const result = validateMatchUp({
        matchUp,
        expectedScore: {
          sets: [
            {
              side1Score: 7,
              side2Score: 6,
              side1TiebreakScore: 9, // Wrong - actual is 7
              side2TiebreakScore: 3,
            },
          ],
        },
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('side1TiebreakScore'))).toBe(true);
    });

    it('should detect side2TiebreakScore mismatch', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET1-S:6/TB7' });
      // Play to 6-6
      for (let g = 0; g < 5; g++) {
        for (let p = 0; p < 4; p++) matchUp = addPoint(matchUp, { winner: 0 });
      }
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) matchUp = addPoint(matchUp, { winner: 1 });
      }
      for (let p = 0; p < 4; p++) matchUp = addPoint(matchUp, { winner: 0 });
      // Tiebreak 7-3
      for (let i = 0; i < 3; i++) matchUp = addPoint(matchUp, { winner: 1 });
      for (let i = 0; i < 7; i++) matchUp = addPoint(matchUp, { winner: 0 });

      const result = validateMatchUp({
        matchUp,
        expectedScore: {
          sets: [
            {
              side1Score: 7,
              side2Score: 6,
              side1TiebreakScore: 7,
              side2TiebreakScore: 5, // Wrong - actual is 3
            },
          ],
        },
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('side2TiebreakScore'))).toBe(true);
    });

    it('should detect score string mismatch', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
      // Play 6-0
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) matchUp = addPoint(matchUp, { winner: 0 });
      }

      const result = validateMatchUp({
        matchUp,
        expectedScore: {
          scoreString: '6-4',
        },
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('Score string mismatch'))).toBe(true);
    });

    it('should pass when no expectedScore is provided', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) matchUp = addPoint(matchUp, { winner: 0 });
      }

      const result = validateMatchUp({ matchUp });
      expect(result.isValid).toBe(true);
      expect(result.expected.sets).toBeUndefined();
      expect(result.expected.scoreString).toBeUndefined();
    });

    it('should validate matching score string', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET1-S:6/TB7' });
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) matchUp = addPoint(matchUp, { winner: 0 });
      }

      const result = validateMatchUp({
        matchUp,
        expectedScore: {
          scoreString: '6-0',
        },
      });

      expect(result.isValid).toBe(true);
    });
  });

  // ==========================================================================
  // getSetScoreString edge cases
  // ==========================================================================
  describe('getSetScoreString edge cases', () => {
    it('should handle undefined/null set scores', () => {
      const result = getSetScoreString({ setNumber: 1 } as any);
      expect(result).toBe('0-0');
    });

    it('should show tiebreak score in parentheses for side2 loser', () => {
      const result = getSetScoreString({
        setNumber: 1,
        side1Score: 7,
        side2Score: 6,
        side1TiebreakScore: 7,
        side2TiebreakScore: 5,
      });
      expect(result).toBe('7-6(5)');
    });

    it('should show tiebreak score in parentheses for side1 loser', () => {
      const result = getSetScoreString({
        setNumber: 1,
        side1Score: 6,
        side2Score: 7,
        side1TiebreakScore: 3,
        side2TiebreakScore: 7,
      });
      expect(result).toBe('6(3)-7');
    });

    it('should handle tiebreak where scores are equal (edge case)', () => {
      // Equal game scores but with tiebreak annotation (unusual but possible)
      const result = getSetScoreString({
        setNumber: 1,
        side1Score: 6,
        side2Score: 6,
        side1TiebreakScore: 0,
        side2TiebreakScore: 0,
      });
      // s1 > s2 is false, so goes to else branch
      expect(result).toBe('6(0)-6');
    });
  });

  // ==========================================================================
  // validateSet edge cases
  // ==========================================================================
  describe('validateSet edge cases', () => {
    it('should validate a simple set with expected games', () => {
      const points: Array<{ winner: number }> = [];
      // 6-0 set
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) {
          points.push({ winner: 0 });
        }
      }

      const result = validateSet({
        points,
        matchUpFormat: 'SET3-S:6/TB7',
        expectedGames: [6, 0],
      });

      expect(result.isValid).toBe(true);
    });

    it('should validate set with tiebreak expectations', () => {
      const points: Array<{ winner: number }> = [];
      // Play to 6-6
      for (let g = 0; g < 5; g++) {
        for (let p = 0; p < 4; p++) points.push({ winner: 0 });
      }
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) points.push({ winner: 1 });
      }
      for (let p = 0; p < 4; p++) points.push({ winner: 0 });

      // Tiebreak 7-2
      for (let i = 0; i < 2; i++) points.push({ winner: 1 });
      for (let i = 0; i < 7; i++) points.push({ winner: 0 });

      const result = validateSet({
        points,
        matchUpFormat: 'SET3-S:6/TB7',
        expectedGames: [7, 6],
        expectedTiebreak: [7, 2],
      });

      expect(result.isValid).toBe(true);
    });

    it('should detect game score mismatch in validateSet', () => {
      const points: Array<{ winner: number }> = [];
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) points.push({ winner: 0 });
      }

      const result = validateSet({
        points,
        matchUpFormat: 'SET3-S:6/TB7',
        expectedGames: [6, 4], // Wrong - actual is 6-0
      });

      expect(result.isValid).toBe(false);
      expect(result.errors.some((e) => e.includes('side2Score'))).toBe(true);
    });

    it('should handle points with server specified', () => {
      const points: Array<{ winner: number; server?: number }> = [];
      for (let g = 0; g < 6; g++) {
        for (let p = 0; p < 4; p++) {
          points.push({ winner: 0, server: g % 2 === 0 ? 0 : 1 });
        }
      }

      const result = validateSet({
        points,
        matchUpFormat: 'SET3-S:6/TB7',
        expectedGames: [6, 0],
      });

      expect(result.isValid).toBe(true);
    });
  });
});
