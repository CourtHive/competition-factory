/**
 * Tests for matchUpFormatGovernor examples from documentation
 * Ensures all documented examples work correctly
 */

import { matchUpFormatGovernor } from '../../index';
import { expect, it, describe } from 'vitest';

describe('matchUpFormatGovernor - Documentation Examples', () => {
  describe('isValidMatchUpFormat - Valid Formats from Documentation', () => {
    it('validates standard format: SET3-S:6/TB7', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET3-S:6/TB7',
      });
      expect(result).toBe(true);
    });

    it('validates final set variation: SET5-S:6/TB7-F:6/TB10', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET5-S:6/TB7-F:6/TB10',
      });
      expect(result).toBe(true);
    });

    it('validates short set with early tiebreak: SET1-S:4/TB7@3', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET1-S:4/TB7@3',
      });
      expect(result).toBe(true);
    });

    it('validates timed format: T20', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'T20',
      });
      expect(result).toBe(true);
    });

    it('validates points-based timed format: T10P', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'T10P',
      });
      expect(result).toBe(true);
    });

    it('validates games-based timed format: T20G', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'T20G',
      });
      expect(result).toBe(true);
    });

    it('validates No-advantage games: SET1-S:6NOAD/TB7', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET1-S:6NOAD/TB7',
      });
      expect(result).toBe(true);
    });

    it('validates exactly 3 timed sets: SET3X-S:T10', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET3X-S:T10',
      });
      expect(result).toBe(true);
    });

    it('validates exactly 4 timed sets (points-based): SET4X-S:T20P', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET4X-S:T20P',
      });
      expect(result).toBe(true);
    });
  });

  describe('isValidMatchUpFormat - Invalid Formats from Documentation', () => {
    it('rejects invalid format string: INVALID', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'INVALID',
      });
      expect(result).toBe(false);
    });

    it('rejects invalid set count: SET0-S:6/TB7', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET0-S:6/TB7',
      });
      expect(result).toBe(false);
    });

    it('rejects incomplete tiebreak: SET3-S:6/TB', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET3-S:6/TB',
      });
      expect(result).toBe(false);
    });

    it('rejects empty string', () => {
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: '',
      });
      expect(result).toBe(false);
    });
  });

  describe('parse - Documentation Examples', () => {
    it('parses standard format: SET3-S:6/TB7', () => {
      const parsed = matchUpFormatGovernor.parse('SET3-S:6/TB7');
      expect(parsed).toEqual({
        bestOf: 3,
        setFormat: {
          setTo: 6,
          tiebreakAt: 6,
          tiebreakFormat: { tiebreakTo: 7 },
        },
      });
    });

    it('parses final set variation: SET5-S:6/TB7-F:6/TB10', () => {
      const parsed = matchUpFormatGovernor.parse('SET5-S:6/TB7-F:6/TB10');
      expect(parsed).toEqual({
        bestOf: 5,
        setFormat: {
          setTo: 6,
          tiebreakAt: 6,
          tiebreakFormat: { tiebreakTo: 7 },
        },
        finalSetFormat: {
          setTo: 6,
          tiebreakAt: 6,
          tiebreakFormat: { tiebreakTo: 10 },
        },
      });
    });

    it('parses timed set: T20', () => {
      const parsed = matchUpFormatGovernor.parse('T20');
      expect(parsed).toMatchObject({
        bestOf: 1,
        simplified: true,
        setFormat: { timed: true, minutes: 20 },
      });
    });

    it('parses short set with early tiebreak: SET1-S:4/TB7@3', () => {
      const parsed = matchUpFormatGovernor.parse('SET1-S:4/TB7@3');
      expect(parsed).toEqual({
        bestOf: 1,
        setFormat: {
          setTo: 4,
          tiebreakAt: 3,
          tiebreakFormat: { tiebreakTo: 7 },
        },
      });
    });

    it('returns undefined for invalid format', () => {
      const parsed = matchUpFormatGovernor.parse('INVALID');
      expect(parsed).toBeUndefined();
    });
  });

  describe('stringify - Documentation Examples', () => {
    it('stringifies standard format', () => {
      const formatString = matchUpFormatGovernor.stringify({
        bestOf: 3,
        setFormat: {
          setTo: 6,
          tiebreakAt: 6,
          tiebreakFormat: { tiebreakTo: 7 },
        },
      });
      expect(formatString).toBe('SET3-S:6/TB7');
    });

    it('stringifies with final set variation', () => {
      const formatString = matchUpFormatGovernor.stringify({
        bestOf: 5,
        setFormat: {
          setTo: 6,
          tiebreakAt: 6,
          tiebreakFormat: { tiebreakTo: 7 },
        },
        finalSetFormat: {
          setTo: 6,
          tiebreakAt: 6,
          tiebreakFormat: { tiebreakTo: 10 },
        },
      });
      expect(formatString).toBe('SET5-S:6/TB7-F:6/TB10');
    });

    it('stringifies timed set', () => {
      const formatString = matchUpFormatGovernor.stringify({
        bestOf: 1,
        simplified: true,
        setFormat: { timed: true, minutes: 20 },
      });
      expect(formatString).toBe('T20');
    });

    it('stringifies with early tiebreak', () => {
      const formatString = matchUpFormatGovernor.stringify({
        bestOf: 1,
        setFormat: {
          setTo: 4,
          tiebreakAt: 3,
          tiebreakFormat: { tiebreakTo: 7 },
        },
      });
      expect(formatString).toBe('SET1-S:4/TB7@3');
    });

    it('omits redundant tiebreakAt by default', () => {
      const formatString = matchUpFormatGovernor.stringify({
        bestOf: 1,
        setFormat: {
          setTo: 6,
          tiebreakAt: 6,
          tiebreakFormat: { tiebreakTo: 7 },
        },
      });
      expect(formatString).toBe('SET1-S:6/TB7');
    });

    it('preserves redundant tiebreakAt when requested', () => {
      const formatString = matchUpFormatGovernor.stringify(
        {
          bestOf: 1,
          setFormat: {
            setTo: 6,
            tiebreakAt: 6,
            tiebreakFormat: { tiebreakTo: 7 },
          },
        },
        true, // preserveRedundant
      );
      expect(formatString).toBe('SET1-S:6/TB7@6');
    });

    it('returns undefined for invalid format object', () => {
      const formatString = matchUpFormatGovernor.stringify({
        bestOf: 0, // Invalid
        setFormat: { setTo: 6 },
      });
      expect(formatString).toBeUndefined();
    });
  });

  describe('Round-trip validation - All documented examples', () => {
    const documentedFormats = [
      'SET3-S:6/TB7',
      'SET5-S:6/TB7-F:6/TB10',
      'SET1-S:4/TB7@3',
      'T20',
      'T10P',
      'T20G',
      'SET1-S:6NOAD/TB7',
      'SET3X-S:T10',
      'SET4X-S:T20P',
    ];

    documentedFormats.forEach((format) => {
      it(`round-trips correctly: ${format}`, () => {
        const parsed = matchUpFormatGovernor.parse(format);
        expect(parsed).toBeDefined();

        const stringified = matchUpFormatGovernor.stringify(parsed);

        // T20G will stringify as T20 (G is optional/default)
        if (format === 'T20G') {
          expect(stringified).toBe('T20');
        } else {
          expect(stringified).toBe(format);
        }

        const isValid = matchUpFormatGovernor.isValidMatchUpFormat({
          matchUpFormat: format,
        });
        expect(isValid).toBe(true);
      });
    });
  });

  describe('Additional edge cases from documentation', () => {
    it('validates that "G" suffix on timed sets is stripped during validation', () => {
      // T20G and T20 should both be valid and equivalent
      const withG = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'T20G',
      });
      const withoutG = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'T20',
      });

      expect(withG).toBe(true);
      expect(withoutG).toBe(true);

      // Parsing T20G should work
      const parsed = matchUpFormatGovernor.parse('T20G');
      expect(parsed).toBeDefined();

      // Stringifying should produce T20 (without G)
      const stringified = matchUpFormatGovernor.stringify(parsed);
      expect(stringified).toBe('T20');
    });

    it('handles non-string values gracefully', () => {
      // @ts-expect-error - testing invalid input
      const result1 = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: null,
      });
      expect(result1).toBe(false);

      // @ts-expect-error - testing invalid input
      const result2 = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: undefined,
      });
      expect(result2).toBe(false);

      // @ts-expect-error - testing invalid input
      const result3 = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 123,
      });
      expect(result3).toBe(false);
    });

    it('validates SET3X only works with timed sets', () => {
      // SET3X with timed sets works
      const timedResult = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET3X-S:T10',
      });
      expect(timedResult).toBe(true);

      const parsedTimed = matchUpFormatGovernor.parse('SET3X-S:T10');
      expect(parsedTimed).toBeDefined();
      expect(parsedTimed).toMatchObject({
        exactly: 3,
        setFormat: { timed: true, minutes: 10 },
      });

      // SET3X with standard game sets does NOT work
      const gameResult = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET3X-S:6/TB7',
      });
      expect(gameResult).toBe(false);

      const parsedGame = matchUpFormatGovernor.parse('SET3X-S:6/TB7');
      expect(parsedGame).toBeUndefined();
    });

    it('validates SET4X only works with timed sets', () => {
      // SET4X with timed sets works
      const result = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET4X-S:T20P',
      });
      expect(result).toBe(true);

      const parsed = matchUpFormatGovernor.parse('SET4X-S:T20P');
      expect(parsed).toMatchObject({
        exactly: 4,
        setFormat: { timed: true, minutes: 20, based: 'P' },
      });

      // SET4X with standard game sets does NOT work
      const gameResult = matchUpFormatGovernor.isValidMatchUpFormat({
        matchUpFormat: 'SET4X-S:6',
      });
      expect(gameResult).toBe(false);
    });
  });
});
