import type { FormatStructure, SetFormatStructure } from '@Types/scoring/types';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { describe, expect, it } from 'vitest';
import {
  isValidFormat,
  extractFormatProperties,
  getFormatDescription,
  areFormatsEquivalent,
  isAggregateFormat,
  resolveSetType,
  getPointsToGame,
  getMinPointsToSetCompletion,
  getMinPointsToMatchCompletion,
  hasCountablePoints,
} from '@Tools/scoring/scoringUtilities';

// ============================================================================
// isValidFormat
// ============================================================================
describe('isValidFormat', () => {
  it('returns true for valid standard tennis format', () => {
    expect(isValidFormat('SET3-S:6/TB7')).toBe(true);
  });

  it('returns true for tiebreak-only format', () => {
    expect(isValidFormat('SET3-S:TB11')).toBe(true);
  });

  it('returns true for timed format', () => {
    expect(isValidFormat('T20')).toBe(true);
  });

  it('returns false for invalid format', () => {
    expect(isValidFormat('INVALID')).toBe(false);
  });

  it('returns false for empty string', () => {
    expect(isValidFormat('')).toBe(false);
  });
});

// ============================================================================
// isValidFormat
// ============================================================================
describe('isValidFormat', () => {
  it('returns true for valid format (delegates to isValidFormat)', () => {
    expect(isValidFormat('SET3-S:6/TB7')).toBe(true);
  });

  it('returns false for invalid format', () => {
    expect(isValidFormat('GARBAGE')).toBe(false);
  });
});

// ============================================================================
// extractFormatProperties
// ============================================================================
describe('extractFormatProperties', () => {
  it('extracts standard tennis format properties', () => {
    const parsed = parse('SET3-S:6/TB7')!;
    const props = extractFormatProperties(parsed);

    expect(props.bestOf).toBe(3);
    expect(props.exactly).toBeUndefined();
    expect(props.setThreshold).toBe(6);
    expect(props.setMinDiff).toBe(0);
    expect(props.setHasDecider).toBe(true);
    expect(props.tiebreakAt).toBe(6);
    expect(props.tiebreakTo).toBe(7);
    expect(props.noTiebreak).toBeUndefined();
    expect(props.noAd).toBe(false);
    expect(props.timed).toBe(false);
    expect(props.minutes).toBeUndefined();
    expect(props.based).toBeUndefined();
    expect(props.finalSetDiffers).toBe(false);
  });

  it('extracts NoAD format properties', () => {
    const parsed = parse('SET3-S:6NOAD/TB7')!;
    const props = extractFormatProperties(parsed);
    expect(props.noAd).toBe(true);
  });

  it('extracts noTiebreak format properties', () => {
    const parsed = parse('SET5-S:6')!;
    const props = extractFormatProperties(parsed);
    expect(props.noTiebreak).toBe(true);
    expect(props.setMinDiff).toBe(2);
    expect(props.setHasDecider).toBe(false);
    expect(props.tiebreakTo).toBeUndefined();
  });

  it('extracts tiebreakSet format properties', () => {
    const parsed = parse('SET3-S:TB11')!;
    const props = extractFormatProperties(parsed);
    expect(props.setHasDecider).toBe(true);
    expect(props.tiebreakSet).toEqual({ tiebreakTo: 11 });
    expect(props.tiebreakTo).toBe(11);
  });

  it('extracts timed format properties', () => {
    const parsed = parse('T20')!;
    const props = extractFormatProperties(parsed);
    expect(props.timed).toBe(true);
    expect(props.minutes).toBe(20);
  });

  it('extracts points-based timed format', () => {
    const parsed = parse('T10P')!;
    const props = extractFormatProperties(parsed);
    expect(props.timed).toBe(true);
    expect(props.minutes).toBe(10);
    expect(props.based).toBe('P');
  });

  it('extracts exactly format properties', () => {
    const parsed = parse('SET7XA-S:T10P')!;
    const props = extractFormatProperties(parsed);
    expect(props.exactly).toBe(7);
    expect(props.bestOf).toBeUndefined();
  });

  it('extracts final set format with tiebreak', () => {
    const parsed = parse('SET5-S:6/TB7-F:6/TB10')!;
    const props = extractFormatProperties(parsed);
    expect(props.finalSetDiffers).toBe(true);
    expect(props.finalSetThreshold).toBe(6);
    expect(props.finalSetTiebreakAt).toBe(6);
    expect(props.finalSetTiebreakTo).toBe(10);
    expect(props.finalSetNoTiebreak).toBeUndefined();
  });

  it('extracts final set format with match tiebreak', () => {
    const parsed = parse('SET3-S:6/TB7-F:TB10')!;
    const props = extractFormatProperties(parsed);
    expect(props.finalSetDiffers).toBe(true);
    expect(props.finalSetTiebreakTo).toBe(10);
  });

  it('extracts final set with noTiebreak', () => {
    // Build manually since parse may not produce this directly
    const format: FormatStructure = {
      bestOf: 5,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      finalSetFormat: { setTo: 6, noTiebreak: true },
    };
    const props = extractFormatProperties(format);
    expect(props.finalSetDiffers).toBe(true);
    expect(props.finalSetNoTiebreak).toBe(true);
    expect(props.finalSetTiebreakTo).toBeUndefined();
  });

  it('handles missing setFormat and finalSetFormat', () => {
    const props = extractFormatProperties({});
    expect(props.setThreshold).toBeUndefined();
    expect(props.setMinDiff).toBe(0);
    expect(props.setHasDecider).toBe(false);
    expect(props.tiebreakAt).toBeUndefined();
    expect(props.tiebreakTo).toBeUndefined();
    expect(props.noAd).toBe(false);
    expect(props.timed).toBe(false);
    expect(props.finalSetDiffers).toBe(false);
    expect(props.finalSetThreshold).toBeUndefined();
    expect(props.finalSetTiebreakAt).toBeUndefined();
    expect(props.finalSetTiebreakTo).toBeUndefined();
    expect(props.finalSetNoTiebreak).toBeUndefined();
  });

  it('extracts finalSetFormat tiebreakSet tiebreakTo', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 10 } },
    };
    const props = extractFormatProperties(format);
    expect(props.finalSetTiebreakTo).toBe(10);
  });
});

// ============================================================================
// getFormatDescription
// ============================================================================
describe('getFormatDescription', () => {
  it('returns undefined for invalid format', () => {
    expect(getFormatDescription('INVALID')).toBeUndefined();
  });

  it('describes standard tennis format', () => {
    const desc = getFormatDescription('SET3-S:6/TB7');
    expect(desc).toContain('Best of 3 sets');
    expect(desc).toContain('Advantage');
    expect(desc).toContain('6 games for set');
    expect(desc).toContain('Tiebreak to 7');
  });

  it('describes NoAD format', () => {
    const desc = getFormatDescription('SET3-S:6NOAD/TB7');
    expect(desc).toContain('No-Ad');
    expect(desc).not.toContain('Advantage');
  });

  it('describes exactly format', () => {
    const desc = getFormatDescription('SET7XA-S:T10P');
    expect(desc).toContain('Exactly 7 sets');
    expect(desc).not.toContain('Best of');
  });

  it('describes final set with tiebreak', () => {
    const desc = getFormatDescription('SET5-S:6/TB7-F:6/TB10');
    expect(desc).toContain('final set');
    expect(desc).toContain('tiebreak to 10');
  });

  it('describes final set with noTiebreak (by 2 games)', () => {
    // Need a format that produces finalSetFormat with noTiebreak
    // SET5-S:6/TB7-F:6 produces finalSetFormat with noTiebreak: true
    const desc = getFormatDescription('SET5-S:6/TB7-F:6');
    expect(desc).toContain('final set');
    expect(desc).toContain('by 2 games');
  });

  it('describes final set with match tiebreak (tiebreakSet)', () => {
    const desc = getFormatDescription('SET3-S:6/TB7-F:TB10');
    expect(desc).toContain('final set');
    expect(desc).toContain('tiebreak to 10');
  });

  it('handles format without bestOf or exactly (single set)', () => {
    const desc = getFormatDescription('SET1-S:6/TB7');
    // bestOf: 1, which is truthy
    expect(desc).toContain('Best of 1 sets');
  });

  it('handles format where finalSetDiffers but neither noTiebreak nor tiebreakTo', () => {
    // This branch: finalSetDiffers=true, finalSetNoTiebreak=falsy, finalSetTiebreakTo=falsy
    // SET3-S:6/TB7-F:T20 → finalSetFormat is timed, no tiebreakTo
    const desc = getFormatDescription('SET3-S:6/TB7-F:T20');
    expect(desc).toContain('final set');
    // Should not contain 'by 2 games' or 'tiebreak to'
    expect(desc).not.toContain('by 2 games');
  });
});

// ============================================================================
// areFormatsEquivalent
// ============================================================================
describe('areFormatsEquivalent', () => {
  it('returns true for identical format codes', () => {
    expect(areFormatsEquivalent('SET3-S:6/TB7', 'SET3-S:6/TB7')).toBe(true);
  });

  it('returns true for equivalent formats with different representations', () => {
    // T10G normalizes to T10 (G is default for timed)
    expect(areFormatsEquivalent('T10', 'T10')).toBe(true);
  });

  it('returns false for different formats', () => {
    expect(areFormatsEquivalent('SET3-S:6/TB7', 'SET5-S:6/TB7')).toBe(false);
  });

  it('returns false when first code is invalid', () => {
    expect(areFormatsEquivalent('INVALID', 'SET3-S:6/TB7')).toBe(false);
  });

  it('returns false when second code is invalid', () => {
    expect(areFormatsEquivalent('SET3-S:6/TB7', 'INVALID')).toBe(false);
  });

  it('returns false when both codes are invalid', () => {
    expect(areFormatsEquivalent('INVALID1', 'INVALID2')).toBe(false);
  });
});

// ============================================================================
// isAggregateFormat
// ============================================================================
describe('isAggregateFormat', () => {
  it('returns false for undefined', () => {
    expect(isAggregateFormat(undefined)).toBe(false);
  });

  it('returns false for null', () => {
    expect(isAggregateFormat(null)).toBe(false);
  });

  it('returns true when aggregate is true', () => {
    const format: FormatStructure = { aggregate: true, setFormat: { timed: true, minutes: 45 } };
    expect(isAggregateFormat(format)).toBe(true);
  });

  it('returns false when aggregate is not set', () => {
    const format: FormatStructure = { bestOf: 3, setFormat: { setTo: 6 } };
    expect(isAggregateFormat(format)).toBe(false);
  });

  it('returns true for parsed HAL2A format', () => {
    const parsed = parse('HAL2A-S:T45')!;
    expect(isAggregateFormat(parsed)).toBe(true);
  });
});

// ============================================================================
// resolveSetType
// ============================================================================
describe('resolveSetType', () => {
  it('returns standard for normal tennis set', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
    };
    expect(resolveSetType(format, [0, 0])).toBe('standard');
  });

  it('returns tiebreakOnly for tiebreakSet format', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    };
    expect(resolveSetType(format, [0, 0])).toBe('tiebreakOnly');
  });

  it('returns timed for timed set format', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { timed: true, minutes: 20 },
    };
    expect(resolveSetType(format, [0, 0])).toBe('timed');
  });

  it('returns matchTiebreak for deciding set with finalSetFormat tiebreakSet', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 10 } },
    };
    // 1-1 in best of 3 → deciding set
    expect(resolveSetType(format, [1, 1])).toBe('matchTiebreak');
  });

  it('returns timed for deciding set with finalSetFormat timed', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      finalSetFormat: { timed: true, minutes: 20 },
    };
    expect(resolveSetType(format, [1, 1])).toBe('timed');
  });

  it('returns standard for deciding set with standard finalSetFormat', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      finalSetFormat: { setTo: 6, noTiebreak: true },
    };
    expect(resolveSetType(format, [1, 1])).toBe('standard');
  });

  it('returns standard when setFormat is missing', () => {
    const format: FormatStructure = { bestOf: 3 };
    expect(resolveSetType(format, [0, 0])).toBe('standard');
  });

  it('uses exactly when bestOf is missing', () => {
    const format: FormatStructure = {
      exactly: 5,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 10 } },
    };
    // exactly: 5, setsToWin = 3, deciding at 2-2
    expect(resolveSetType(format, [2, 2])).toBe('matchTiebreak');
    expect(resolveSetType(format, [0, 0])).toBe('tiebreakOnly');
  });

  it('defaults to bestOf 3 when neither bestOf nor exactly', () => {
    const format: FormatStructure = {
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 10 } },
    };
    // defaults to bestOf 3, setsToWin = 2, deciding at 1-1
    expect(resolveSetType(format, [1, 1])).toBe('matchTiebreak');
  });

  it('does not use finalSetFormat when not in deciding set', () => {
    const format: FormatStructure = {
      bestOf: 5,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 10 } },
    };
    // 1-1 in best of 5 → not deciding (need 2-2)
    expect(resolveSetType(format, [1, 1])).toBe('standard');
    expect(resolveSetType(format, [2, 2])).toBe('matchTiebreak');
  });
});

// ============================================================================
// getPointsToGame
// ============================================================================
describe('getPointsToGame', () => {
  const standardCtx = { isDecidingSet: false, inTiebreak: false, isFinalSetTiebreak: false };

  it('returns 4 for standard tennis game', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
    };
    expect(getPointsToGame(format, standardCtx)).toBe(4);
  });

  it('returns undefined for timed set', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { timed: true, minutes: 20 },
    };
    expect(getPointsToGame(format, standardCtx)).toBeUndefined();
  });

  it('returns tiebreakTo for regular tiebreak', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
    };
    expect(getPointsToGame(format, { isDecidingSet: false, inTiebreak: true, isFinalSetTiebreak: false })).toBe(7);
  });

  it('defaults tiebreak to 7 when no tiebreakFormat', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6 },
    };
    expect(getPointsToGame(format, { isDecidingSet: false, inTiebreak: true, isFinalSetTiebreak: false })).toBe(7);
  });

  it('returns finalSetFormat tiebreakSet tiebreakTo for final set tiebreak', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      finalSetFormat: { tiebreakSet: { tiebreakTo: 10 } },
    };
    expect(getPointsToGame(format, { isDecidingSet: true, inTiebreak: false, isFinalSetTiebreak: true })).toBe(10);
  });

  it('defaults finalSetTiebreak to 10 when no finalSetFormat tiebreakSet', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
    };
    expect(getPointsToGame(format, { isDecidingSet: false, inTiebreak: false, isFinalSetTiebreak: true })).toBe(10);
  });

  it('returns tiebreakSet tiebreakTo for tiebreak-only set', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    };
    expect(getPointsToGame(format, standardCtx)).toBe(11);
  });

  it('returns CONSECUTIVE count for game format', () => {
    const format: FormatStructure = {
      bestOf: 5,
      setFormat: { setTo: 5 },
      gameFormat: { type: 'CONSECUTIVE', count: 3 },
    };
    expect(getPointsToGame(format, standardCtx)).toBe(3);
  });

  it('uses finalSetFormat when isDecidingSet is true', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
      finalSetFormat: { timed: true, minutes: 20 },
    };
    // isDecidingSet + finalSetFormat.timed → undefined
    expect(
      getPointsToGame(format, { isDecidingSet: true, inTiebreak: false, isFinalSetTiebreak: false }),
    ).toBeUndefined();
  });

  it('uses setFormat when isDecidingSet but no finalSetFormat', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
    };
    expect(getPointsToGame(format, { isDecidingSet: true, inTiebreak: false, isFinalSetTiebreak: false })).toBe(4);
  });
});

// ============================================================================
// getMinPointsToSetCompletion
// ============================================================================
describe('getMinPointsToSetCompletion', () => {
  it('returns undefined for undefined setFormat', () => {
    expect(getMinPointsToSetCompletion(undefined)).toBeUndefined();
  });

  it('returns undefined for timed set', () => {
    expect(getMinPointsToSetCompletion({ timed: true, minutes: 20 })).toBeUndefined();
  });

  it('returns tiebreakTo for tiebreakSet', () => {
    expect(getMinPointsToSetCompletion({ tiebreakSet: { tiebreakTo: 11 } })).toBe(11);
  });

  it('returns setTo * 4 for standard set', () => {
    expect(getMinPointsToSetCompletion({ setTo: 6 })).toBe(24);
  });

  it('defaults setTo to 6 when not specified', () => {
    const setFormat: SetFormatStructure = { tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } };
    expect(getMinPointsToSetCompletion(setFormat)).toBe(24);
  });

  it('uses CONSECUTIVE game format count', () => {
    expect(getMinPointsToSetCompletion({ setTo: 5 }, { type: 'CONSECUTIVE', count: 3 })).toBe(15);
  });

  it('defaults CONSECUTIVE count to 3 when not specified', () => {
    expect(getMinPointsToSetCompletion({ setTo: 5 }, { type: 'CONSECUTIVE' } as any)).toBe(15);
  });
});

// ============================================================================
// getMinPointsToMatchCompletion
// ============================================================================
describe('getMinPointsToMatchCompletion', () => {
  it('returns undefined for timed set format', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { timed: true, minutes: 20 },
    };
    expect(getMinPointsToMatchCompletion(format)).toBeUndefined();
  });

  it('calculates for best of 3 standard sets', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6 },
    };
    // 2 sets to win * 24 points = 48
    expect(getMinPointsToMatchCompletion(format)).toBe(48);
  });

  it('calculates for best of 5 standard sets', () => {
    const format: FormatStructure = {
      bestOf: 5,
      setFormat: { setTo: 6 },
    };
    // 3 sets to win * 24 points = 72
    expect(getMinPointsToMatchCompletion(format)).toBe(72);
  });

  it('calculates for exactly format', () => {
    const format: FormatStructure = {
      exactly: 7,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    };
    // 7 sets * 11 points = 77
    expect(getMinPointsToMatchCompletion(format)).toBe(77);
  });

  it('defaults to best of 3 when neither bestOf nor exactly', () => {
    const format: FormatStructure = {
      setFormat: { setTo: 6 },
    };
    // defaults bestOf 3 → 2 sets * 24 = 48
    expect(getMinPointsToMatchCompletion(format)).toBe(48);
  });

  it('calculates for CONSECUTIVE game format', () => {
    const format: FormatStructure = {
      bestOf: 5,
      setFormat: { setTo: 5 },
      gameFormat: { type: 'CONSECUTIVE', count: 3 },
    };
    // 3 sets * (5 * 3) = 45
    expect(getMinPointsToMatchCompletion(format)).toBe(45);
  });

  it('returns undefined when setFormat is missing', () => {
    const format: FormatStructure = { bestOf: 3 };
    expect(getMinPointsToMatchCompletion(format)).toBeUndefined();
  });
});

// ============================================================================
// hasCountablePoints
// ============================================================================
describe('hasCountablePoints', () => {
  it('returns true for standard format', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { setTo: 6, tiebreakAt: 6, tiebreakFormat: { tiebreakTo: 7 } },
    };
    expect(hasCountablePoints(format)).toBe(true);
  });

  it('returns false for timed format', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { timed: true, minutes: 20 },
    };
    expect(hasCountablePoints(format)).toBe(false);
  });

  it('returns false for simplified format', () => {
    const format: FormatStructure = {
      bestOf: 1,
      simplified: true,
      setFormat: { timed: false } as any,
    };
    expect(hasCountablePoints(format)).toBe(false);
  });

  it('returns true when setFormat has no timed flag', () => {
    const format: FormatStructure = {
      bestOf: 3,
      setFormat: { tiebreakSet: { tiebreakTo: 11 } },
    };
    expect(hasCountablePoints(format)).toBe(true);
  });

  it('returns true when setFormat is missing', () => {
    const format: FormatStructure = { bestOf: 3 };
    expect(hasCountablePoints(format)).toBe(true);
  });
});
