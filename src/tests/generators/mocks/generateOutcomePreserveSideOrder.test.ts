/**
 * Tests for preserveSideOrder parameter in generateOutcomeFromScoreString
 *
 * Tests that the new preserveSideOrder parameter allows UIs to preserve
 * the exact side order that users enter, rather than normalizing to winner-first
 */
import { describe, it, expect } from 'vitest';
import { generateOutcomeFromScoreString } from '@Assemblies/generators/mocks/generateOutcomeFromScoreString';

describe('generateOutcomeFromScoreString - preserveSideOrder parameter', () => {
  describe('Standard format without preserveSideOrder (default behavior)', () => {
    it('should normalize to winner-first for standard format (backward compatibility)', () => {
      const format = 'SET3-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '3-6 4-6',
        matchUpFormat: format,
      });

      // Default behavior: normalizes to winner-first
      // "3-6 4-6" becomes "6-3 6-4" (side 2 won, shown as side 1)
      expect(outcome.score.sets[0].side1Score).toBe(6);
      expect(outcome.score.sets[0].side2Score).toBe(3);
      expect(outcome.score.sets[1].side1Score).toBe(6);
      expect(outcome.score.sets[1].side2Score).toBe(4);
      expect(outcome.winningSide).toBe(2);
    });

    it('should normalize winner-first for loser score first', () => {
      const format = 'SET3-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '2-6 3-6',
        matchUpFormat: format,
      });

      // Normalized to winner-first: "6-2 6-3"
      expect(outcome.score.sets[0].side1Score).toBe(6);
      expect(outcome.score.sets[0].side2Score).toBe(2);
      expect(outcome.winningSide).toBe(2);
    });
  });

  describe('Standard format WITH preserveSideOrder=true', () => {
    it('should preserve side order even when loser score is first', () => {
      const format = 'SET3-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '3-6 4-6',
        matchUpFormat: format,
        preserveSideOrder: true,
      });

      // Preserves order: side1 lost 3-6, 4-6
      expect(outcome.score.sets[0].side1Score).toBe(3);
      expect(outcome.score.sets[0].side2Score).toBe(6);
      expect(outcome.score.sets[1].side1Score).toBe(4);
      expect(outcome.score.sets[1].side2Score).toBe(6);

      // winningSide still calculated correctly (side 2 won)
      expect(outcome.winningSide).toBe(2);
    });

    it('should preserve side order when winner score is first', () => {
      const format = 'SET3-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '6-3 6-4',
        matchUpFormat: format,
        preserveSideOrder: true,
      });

      // Preserves order: side1 won 6-3, 6-4
      expect(outcome.score.sets[0].side1Score).toBe(6);
      expect(outcome.score.sets[0].side2Score).toBe(3);
      expect(outcome.score.sets[1].side1Score).toBe(6);
      expect(outcome.score.sets[1].side2Score).toBe(4);
      expect(outcome.winningSide).toBe(1);
    });

    it('should preserve split sets correctly', () => {
      const format = 'SET3-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '6-3 4-6 6-4',
        matchUpFormat: format,
        preserveSideOrder: true,
      });

      // Preserves exact order: side1 won set 1, lost set 2, won set 3
      expect(outcome.score.sets[0].side1Score).toBe(6);
      expect(outcome.score.sets[0].side2Score).toBe(3);
      expect(outcome.score.sets[1].side1Score).toBe(4);
      expect(outcome.score.sets[1].side2Score).toBe(6);
      expect(outcome.score.sets[2].side1Score).toBe(6);
      expect(outcome.score.sets[2].side2Score).toBe(4);
      expect(outcome.winningSide).toBe(1);
    });
  });

  describe('Aggregate format (already preserves order)', () => {
    it('should preserve order without preserveSideOrder flag (existing behavior)', () => {
      const format = 'SET3XA-S:T10';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '30-1 0-1 0-1',
        matchUpFormat: format,
      });

      // Aggregate already preserves order
      expect(outcome.score.sets[0].side1Score).toBe(30);
      expect(outcome.score.sets[0].side2Score).toBe(1);
      expect(outcome.winningSide).toBe(1); // Aggregate: 30-3
    });

    it('should still preserve order with preserveSideOrder=true (no-op)', () => {
      const format = 'SET3XA-S:T10';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '1-30 1-0 1-0',
        matchUpFormat: format,
        preserveSideOrder: true,
      });

      // Still preserves order (side 2 wins aggregate 32-3)
      expect(outcome.score.sets[0].side1Score).toBe(1);
      expect(outcome.score.sets[0].side2Score).toBe(30);
      expect(outcome.winningSide).toBe(2); // Aggregate: 3-32
    });
  });

  describe('Bracket notation (triggers side-order preservation)', () => {
    it('should preserve order when score starts with bracket (existing behavior)', () => {
      const format = 'SET3-S:TB10';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '[5-10]',
        matchUpFormat: format,
      });

      // Bracket notation at start triggers side-order preservation
      // Note: For tiebreak-only format, these are tiebreak scores, not regular scores
      expect(outcome.score.sets[0].side1Score).toBe(5);
      expect(outcome.score.sets[0].side2Score).toBe(10);
      expect(outcome.winningSide).toBe(2);
    });
  });

  describe('Edge cases', () => {
    it('should handle preserveSideOrder=false explicitly (same as default)', () => {
      const format = 'SET3-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '3-6 4-6',
        matchUpFormat: format,
        preserveSideOrder: false,
      });

      // Explicit false: normalizes to winner-first
      expect(outcome.score.sets[0].side1Score).toBe(6);
      expect(outcome.score.sets[0].side2Score).toBe(3);
      expect(outcome.winningSide).toBe(2);
    });

    it('should preserve tiebreak scores correctly', () => {
      const format = 'SET3-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '6-7(3) 6-7(5)',
        matchUpFormat: format,
        preserveSideOrder: true,
      });

      // Preserves: side1 lost both tiebreaks
      expect(outcome.score.sets[0].side1Score).toBe(6);
      expect(outcome.score.sets[0].side2Score).toBe(7);
      expect(outcome.score.sets[0].side1TiebreakScore).toBe(3);
      expect(outcome.score.sets[0].side2TiebreakScore).toBe(7);
      expect(outcome.winningSide).toBe(2);
    });

    it('should work with SET5 format', () => {
      const format = 'SET5-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '4-6 3-6 6-4 6-3 6-4',
        matchUpFormat: format,
        preserveSideOrder: true,
      });

      // Preserves all 5 sets: side1 lost first 2, won last 3
      expect(outcome.score.sets[0].side1Score).toBe(4);
      expect(outcome.score.sets[0].side2Score).toBe(6);
      expect(outcome.score.sets[1].side1Score).toBe(3);
      expect(outcome.score.sets[1].side2Score).toBe(6);
      expect(outcome.score.sets[2].side1Score).toBe(6);
      expect(outcome.score.sets[2].side2Score).toBe(4);
      expect(outcome.score.sets[3].side1Score).toBe(6);
      expect(outcome.score.sets[3].side2Score).toBe(3);
      expect(outcome.score.sets[4].side1Score).toBe(6);
      expect(outcome.score.sets[4].side2Score).toBe(4);
      expect(outcome.winningSide).toBe(1);
    });

    it('should handle empty scoreString', () => {
      const format = 'SET3-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '',
        matchUpFormat: format,
        preserveSideOrder: true,
      });

      // Empty scoreString returns default outcome
      expect(outcome.winningSide).toBeUndefined();
    });
  });

  describe('Scorestring generation', () => {
    it('should generate correct scoreStringSide1 and scoreStringSide2 with preserved order', () => {
      const format = 'SET3-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '3-6 4-6',
        matchUpFormat: format,
        preserveSideOrder: true,
      });

      // Side 1 perspective: "3-6 4-6" (what they scored)
      expect(outcome.score.scoreStringSide1).toBe('3-6 4-6');
      // Side 2 perspective: "6-3 6-4" (what they scored)
      expect(outcome.score.scoreStringSide2).toBe('6-3 6-4');
    });

    it('should generate correct scoreStrings for winner-first (default)', () => {
      const format = 'SET3-S:6/TB7';
      const { outcome } = generateOutcomeFromScoreString({
        scoreString: '3-6 4-6',
        matchUpFormat: format,
      });

      // Normalized to winner-first (side 2 won)
      // Side 1 perspective: "6-3 6-4" (winner's view)
      expect(outcome.score.scoreStringSide1).toBe('6-3 6-4');
      // Side 2 perspective: "3-6 4-6" (loser's view from winner's scores)
      expect(outcome.score.scoreStringSide2).toBe('3-6 4-6');
    });
  });
});
