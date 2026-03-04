/**
 * generateOutcome tests for INN4XA-S:O3-M:T50 (BLW wiffle ball)
 *
 * Verifies that the outcome generator:
 * - Always produces exactly 4 innings
 * - All set scores are single-digit (0-9)
 * - Never produces an aggregate tie
 * - Winner matches the side with higher aggregate
 * - winningSide override preserves score bounds
 */

import mocksEngine from '@Assemblies/engines/mock';
import { generateRange } from '@Tools/arrays';
import { describe, test, expect } from 'vitest';
import { COMPLETED } from '@Constants/matchUpStatusConstants';

const BLW_FORMAT = 'INN4XA-S:O3-M:T50';

describe('generateOutcome with INN4XA-S:O3-M:T50', () => {
  test('generates exactly 4 innings with single-digit scores', () => {
    generateRange(0, 50).forEach(() => {
      const { outcome } = mocksEngine.generateOutcome({
        matchUpFormat: BLW_FORMAT,
        matchUpStatusProfile: {},
      });

      expect(outcome.matchUpStatus).toBe(COMPLETED);
      expect(outcome.score.sets.length).toBe(4);

      for (const set of outcome.score.sets) {
        expect(set.side1Score).toBeGreaterThanOrEqual(0);
        expect(set.side1Score).toBeLessThanOrEqual(9);
        expect(set.side2Score).toBeGreaterThanOrEqual(0);
        expect(set.side2Score).toBeLessThanOrEqual(9);
      }
    });
  });

  test('always determines a winner by aggregate (no ties)', () => {
    generateRange(0, 100).forEach(() => {
      const { outcome } = mocksEngine.generateOutcome({
        matchUpFormat: BLW_FORMAT,
        matchUpStatusProfile: {},
      });

      expect(outcome.winningSide).toBeDefined();
      expect([1, 2]).toContain(outcome.winningSide);

      const side1Total = outcome.score.sets.reduce((s, set) => s + set.side1Score, 0);
      const side2Total = outcome.score.sets.reduce((s, set) => s + set.side2Score, 0);

      // No aggregate tie
      expect(side1Total).not.toBe(side2Total);

      // Winner matches aggregate
      if (outcome.winningSide === 1) {
        expect(side1Total).toBeGreaterThan(side2Total);
      } else {
        expect(side2Total).toBeGreaterThan(side1Total);
      }
    });
  });

  test('winningSide 1 override works and preserves single-digit scores', () => {
    generateRange(0, 30).forEach(() => {
      const { outcome } = mocksEngine.generateOutcome({
        matchUpFormat: BLW_FORMAT,
        matchUpStatusProfile: {},
        winningSide: 1,
      });

      expect(outcome.winningSide).toBe(1);
      expect(outcome.score.sets.length).toBe(4);

      const side1Total = outcome.score.sets.reduce((s, set) => s + set.side1Score, 0);
      const side2Total = outcome.score.sets.reduce((s, set) => s + set.side2Score, 0);
      expect(side1Total).toBeGreaterThan(side2Total);

      for (const set of outcome.score.sets) {
        expect(set.side1Score).toBeLessThanOrEqual(9);
        expect(set.side2Score).toBeLessThanOrEqual(9);
        expect(set.side1Score).toBeGreaterThanOrEqual(0);
        expect(set.side2Score).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test('winningSide 2 override works and preserves single-digit scores', () => {
    generateRange(0, 30).forEach(() => {
      const { outcome } = mocksEngine.generateOutcome({
        matchUpFormat: BLW_FORMAT,
        matchUpStatusProfile: {},
        winningSide: 2,
      });

      expect(outcome.winningSide).toBe(2);
      expect(outcome.score.sets.length).toBe(4);

      const side1Total = outcome.score.sets.reduce((s, set) => s + set.side1Score, 0);
      const side2Total = outcome.score.sets.reduce((s, set) => s + set.side2Score, 0);
      expect(side2Total).toBeGreaterThan(side1Total);

      for (const set of outcome.score.sets) {
        expect(set.side1Score).toBeLessThanOrEqual(9);
        expect(set.side2Score).toBeLessThanOrEqual(9);
        expect(set.side1Score).toBeGreaterThanOrEqual(0);
        expect(set.side2Score).toBeGreaterThanOrEqual(0);
      }
    });
  });

  test('also works with INN4XA-S:O3 (no match time cap)', () => {
    generateRange(0, 20).forEach(() => {
      const { outcome } = mocksEngine.generateOutcome({
        matchUpFormat: 'INN4XA-S:O3',
        matchUpStatusProfile: {},
      });

      expect(outcome.winningSide).toBeDefined();
      expect(outcome.score.sets.length).toBe(4);

      const side1Total = outcome.score.sets.reduce((s, set) => s + set.side1Score, 0);
      const side2Total = outcome.score.sets.reduce((s, set) => s + set.side2Score, 0);
      expect(side1Total).not.toBe(side2Total);

      for (const set of outcome.score.sets) {
        expect(set.side1Score).toBeLessThanOrEqual(9);
        expect(set.side2Score).toBeLessThanOrEqual(9);
      }
    });
  });
});
