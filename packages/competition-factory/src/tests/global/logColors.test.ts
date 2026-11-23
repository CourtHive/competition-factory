/**
 * Unit tests for the dev-time ANSI / RGB color helpers.
 */
import { describe, expect, it } from 'vitest';

import { logColors, rgbColors, rgbToHex } from '@Functions/global/logColors';

describe('logColors', () => {
  it('exposes the standard ANSI escape sequences', () => {
    expect(logColors.reset).toBe('\x1b[0m');
    expect(logColors.red).toBe('\x1b[31m');
    expect(logColors.green).toBe('\x1b[32m');
    expect(typeof logColors.brightwhite).toBe('string');
  });

  it('exposes named RGB tuples', () => {
    expect(rgbColors.gold).toEqual([255, 215, 0]);
    expect(rgbColors.pink).toEqual([233, 36, 116]);
    expect(rgbColors.lime).toEqual([0, 255, 0]);
  });
});

describe('rgbToHex', () => {
  it('joins RGB channel hex codes for known colors', () => {
    expect(rgbToHex(rgbColors.lime)).toBe('0' + 'ff' + '0');
    expect(rgbToHex([255, 255, 255])).toBe('ffffff');
  });

  it('returns an empty string for an empty input', () => {
    expect(rgbToHex([])).toBe('');
  });
});
