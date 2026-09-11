/**
 * v4.0 Tests - Query Functions
 */

import { describe, test, expect } from 'vitest';
import {
  createMatchUp,
  addPoint,
  getScore,
  getScoreboard,
  getWinner,
  isComplete,
} from '@Assemblies/governors/scoreGovernor';

describe('Query Functions', () => {
  describe('getWinner', () => {
    test('should return undefined for incomplete match', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });

      expect(getWinner(matchUp)).toBeUndefined();
      expect(isComplete(matchUp)).toBe(false);
    });

    test('should return winner for completed match', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET1-S:1/TB7' });

      // Win 1 game (simplified format)
      for (let i = 0; i < 4; i++) {
        matchUp = addPoint(matchUp, { winner: 0 });
      }

      expect(isComplete(matchUp)).toBe(true);
      expect(getWinner(matchUp)).toBe(1); // Side 1 (0-indexed player becomes 1-indexed side)
    });
  });

  describe('isComplete', () => {
    test('should return false for new match', () => {
      const matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
      expect(isComplete(matchUp)).toBe(false);
    });

    test('should return false for in-progress match', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });
      matchUp = addPoint(matchUp, { winner: 0 });

      expect(isComplete(matchUp)).toBe(false);
    });

    test('should return true for completed match', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET1-S:1/TB7' });

      // Win 1 game
      for (let i = 0; i < 4; i++) {
        matchUp = addPoint(matchUp, { winner: 0 });
      }

      expect(isComplete(matchUp)).toBe(true);
    });
  });

  describe('getScoreboard', () => {
    test('should show 0-0 for new match', () => {
      const matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });

      expect(getScoreboard(matchUp)).toBe('0-0');
    });

    test('should show game score in progress', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });

      // 15-0
      matchUp = addPoint(matchUp, { winner: 0 });
      expect(getScoreboard(matchUp)).toBe('0-0 (15-0)');

      // 15-15
      matchUp = addPoint(matchUp, { winner: 1 });
      expect(getScoreboard(matchUp)).toBe('0-0 (15-15)');

      // 30-15
      matchUp = addPoint(matchUp, { winner: 0 });
      expect(getScoreboard(matchUp)).toBe('0-0 (30-15)');
    });

    test('should show deuce', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });

      // Get to 40-40
      matchUp = addPoint(matchUp, { winner: 0 }); // 15-0
      matchUp = addPoint(matchUp, { winner: 0 }); // 30-0
      matchUp = addPoint(matchUp, { winner: 0 }); // 40-0
      matchUp = addPoint(matchUp, { winner: 1 }); // 40-15
      matchUp = addPoint(matchUp, { winner: 1 }); // 40-30
      matchUp = addPoint(matchUp, { winner: 1 }); // 40-40

      expect(getScoreboard(matchUp)).toBe('0-0 (40-40)');
    });

    test('should show advantage', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });

      // Get to 40-40, then advantage
      matchUp = addPoint(matchUp, { winner: 0 }); // 15-0
      matchUp = addPoint(matchUp, { winner: 0 }); // 30-0
      matchUp = addPoint(matchUp, { winner: 0 }); // 40-0
      matchUp = addPoint(matchUp, { winner: 1 }); // 40-15
      matchUp = addPoint(matchUp, { winner: 1 }); // 40-30
      matchUp = addPoint(matchUp, { winner: 1 }); // 40-40
      matchUp = addPoint(matchUp, { winner: 0 }); // A-40

      expect(getScoreboard(matchUp)).toBe('0-0 (A-40)');
    });

    test('should show set score after game complete', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });

      // Win first game
      for (let i = 0; i < 4; i++) {
        matchUp = addPoint(matchUp, { winner: 0 });
      }

      expect(getScoreboard(matchUp)).toBe('1-0');
    });

    test('should show multiple sets', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:1/TB7' });

      // Win first set (1 game each)
      for (let i = 0; i < 4; i++) {
        matchUp = addPoint(matchUp, { winner: 0 });
      }

      // Should show first set won
      expect(getScoreboard(matchUp)).toContain('1-0');
    });

    test('should handle perspective parameter', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });

      matchUp = addPoint(matchUp, { winner: 0 }); // 15-0

      // Normal perspective
      expect(getScoreboard(matchUp)).toBe('0-0 (15-0)');

      // Reversed perspective (from player 1's view)
      expect(getScoreboard(matchUp, { perspective: 1 })).toBe('0-0 (0-15)');
    });
  });

  describe('getScore integration', () => {
    test('should return detailed score information', () => {
      let matchUp = createMatchUp({ matchUpFormat: 'SET3-S:6/TB7' });

      // Win first game
      for (let i = 0; i < 4; i++) {
        matchUp = addPoint(matchUp, { winner: 0 });
      }

      const score = getScore(matchUp);
      expect(score.games).toEqual([1, 0]);
      expect(score.points).toEqual([0, 0]);
      expect(score.sets).toHaveLength(1);
    });
  });
});
