import { generateTimeCode } from '@Tools/timeCode';
import { describe, expect, test } from 'vitest';

describe('generateTimeCode', () => {
  test('generates 6-character uppercase code', () => {
    const code = generateTimeCode();
    expect(code).toHaveLength(6);
    expect(code).toEqual(code.toUpperCase());
  });

  test('generates different codes with different indexes', () => {
    const code1 = generateTimeCode(0);
    const code2 = generateTimeCode(1);
    const code3 = generateTimeCode(2);

    // All should be valid
    expect(code1).toHaveLength(6);
    expect(code2).toHaveLength(6);
    expect(code3).toHaveLength(6);

    // They should be different
    expect(code1).not.toEqual(code2);
    expect(code2).not.toEqual(code3);
  });

  test('handles default index of 0', () => {
    const code1 = generateTimeCode();
    const code2 = generateTimeCode(0);

    // Should produce same or very similar codes (within same second)
    expect(code1).toHaveLength(6);
    expect(code2).toHaveLength(6);
  });

  test('handles negative indexes', () => {
    const code = generateTimeCode(-1);
    expect(code).toHaveLength(6);
    expect(code).toEqual(code.toUpperCase());
  });

  test('handles large indexes', () => {
    const code = generateTimeCode(1000);
    expect(code).toHaveLength(6);
    expect(code).toEqual(code.toUpperCase());
  });

  test('handles invalid inputs gracefully', () => {
    // NaN should default to 0
    const code1 = generateTimeCode(Number.NaN);
    expect(code1).toHaveLength(6);

    // Non-number should default to 0
    const code2 = generateTimeCode('invalid' as any);
    expect(code2).toHaveLength(6);

    // Undefined should default to 0
    const code3 = generateTimeCode();
    expect(code3).toHaveLength(6);
  });

  test('uses base36 encoding (0-9 and A-Z)', () => {
    const code = generateTimeCode();
    const validChars = /^[0-9A-Z]{6}$/;
    expect(code).toMatch(validChars);
  });

  test('generates unique codes over time', () => {
    const codes = new Set();
    for (let i = 0; i < 100; i++) {
      codes.add(generateTimeCode(i));
    }

    // Should have generated many unique codes
    expect(codes.size).toBeGreaterThan(90);
  });
});
