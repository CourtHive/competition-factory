import { describe, expect, test } from 'vitest';
import {
  coerceEven,
  deriveExponent,
  fixedDecimals,
  isConvertableInteger,
  isNumeric,
  isOdd,
  isPowerOf2,
  median,
  nearestPowerOf2,
  nextPowerOf2,
  randomInt,
  safePct,
  skewedDistribution,
  weightedRandom,
} from '@Tools/math';

describe('safePct', () => {
  test('basic percentage calculations', () => {
    expect(safePct(0, 0)).toEqual(0);
    expect(safePct(0, 1)).toEqual(0);
    expect(safePct(1, 0)).toEqual(0);
    expect(safePct(1, 1)).toEqual(100);
    expect(safePct(1, 2)).toEqual(50);
    expect(safePct(2, 1)).toEqual(200);
    expect(safePct(2, 0)).toEqual(0);
    expect(safePct(0, 2)).toEqual(0);
    expect(safePct(0, 2, false)).toEqual(0);
    expect(safePct(0, 2, true)).toEqual(0);
    expect(safePct(0, 2, false)).toEqual(0);
  });

  test('edge cases with NaN and invalid inputs', () => {
    expect(safePct(Number.NaN, 1)).toEqual(0);
    expect(safePct(1, Number.NaN)).toEqual(0);
    expect(safePct(Number.NaN, Number.NaN)).toEqual(0);
  });

  test('unrounded percentage calculations', () => {
    expect(safePct(1, 3, false)).toBeCloseTo(0.3333, 4);
    expect(safePct(2, 3, false)).toBeCloseTo(0.6667, 4);
  });
});

describe('isConvertableInteger', () => {
  test('valid integers', () => {
    expect(isConvertableInteger(0)).toBe(true);
    expect(isConvertableInteger(1)).toBe(true);
    expect(isConvertableInteger(-1)).toBe(true);
    expect(isConvertableInteger(42)).toBe(true);
  });

  test('string integers', () => {
    expect(isConvertableInteger('0')).toBe(true);
    expect(isConvertableInteger('42')).toBe(true);
    expect(isConvertableInteger('-42')).toBe(true);
  });

  test('floating point numbers', () => {
    expect(isConvertableInteger(1.5)).toBe(false);
    expect(isConvertableInteger('1.5')).toBe(false);
    expect(isConvertableInteger('1.0')).toBe(true); // Special case: accepts '1.0'
  });

  test('boundary values', () => {
    expect(isConvertableInteger(Number.MAX_SAFE_INTEGER)).toBe(true);
    expect(isConvertableInteger(Number.MIN_SAFE_INTEGER)).toBe(true);
    expect(isConvertableInteger(Number.MAX_SAFE_INTEGER + 1)).toBe(false);
    expect(isConvertableInteger(Number.MIN_SAFE_INTEGER - 1)).toBe(false);
  });

  test('special values', () => {
    expect(isConvertableInteger(Infinity)).toBe(false);
    expect(isConvertableInteger(-Infinity)).toBe(false);
    expect(isConvertableInteger(Number.NaN)).toBe(false);
  });

  test('invalid strings', () => {
    expect(isConvertableInteger('abc')).toBe(false);
    expect(isConvertableInteger('')).toBe(false);
    expect(isConvertableInteger('  ')).toBe(false);
  });
});

describe('isPowerOf2', () => {
  test('valid powers of 2', () => {
    expect(isPowerOf2(1)).toBe(true);
    expect(isPowerOf2(2)).toBe(true);
    expect(isPowerOf2(4)).toBe(true);
    expect(isPowerOf2(8)).toBe(true);
    expect(isPowerOf2(16)).toBe(true);
    expect(isPowerOf2(1024)).toBe(true);
  });

  test('non-powers of 2', () => {
    expect(isPowerOf2(0)).toBe(false);
    expect(isPowerOf2(3)).toBe(false);
    expect(isPowerOf2(5)).toBe(false);
    expect(isPowerOf2(6)).toBe(false);
    expect(isPowerOf2(7)).toBe(false);
    expect(isPowerOf2(100)).toBe(false);
  });

  test('negative numbers', () => {
    expect(isPowerOf2(-2)).toBe(false);
    expect(isPowerOf2(-4)).toBe(false);
  });

  test('special values', () => {
    expect(isPowerOf2(Number.NaN)).toBe(false);
    expect(isPowerOf2()).toBe(false);
    expect(isPowerOf2(null)).toBe(false);
  });
});

describe('nextPowerOf2', () => {
  test('finds next power of 2', () => {
    expect(nextPowerOf2(3)).toBe(4);
    expect(nextPowerOf2(5)).toBe(8);
    expect(nextPowerOf2(9)).toBe(16);
    expect(nextPowerOf2(17)).toBe(32);
  });

  test('returns same if already power of 2', () => {
    expect(nextPowerOf2(2)).toBe(2);
    expect(nextPowerOf2(4)).toBe(4);
    expect(nextPowerOf2(8)).toBe(8);
    expect(nextPowerOf2(16)).toBe(16);
  });

  test('edge cases', () => {
    expect(nextPowerOf2(1)).toBe(1);
    expect(nextPowerOf2(Number.NaN)).toBe(false);
    expect(nextPowerOf2()).toBe(false);
  });
});

describe('isNumeric', () => {
  test('numeric values', () => {
    expect(isNumeric(0)).toBe(true);
    expect(isNumeric(1)).toBe(true);
    expect(isNumeric(-1)).toBe(true);
    expect(isNumeric(3.14)).toBe(true);
  });

  test('numeric strings', () => {
    expect(isNumeric('0')).toBe(true);
    expect(isNumeric('42')).toBe(true);
    expect(isNumeric('-42')).toBe(true);
    expect(isNumeric('3.14')).toBe(true);
  });

  test('non-numeric values', () => {
    expect(isNumeric('abc')).toBe(false);
    expect(isNumeric('')).toBe(false);
    expect(isNumeric(Number.NaN)).toBe(false);
  });

  test('special numeric values', () => {
    expect(isNumeric(Infinity)).toBe(true);
    expect(isNumeric(-Infinity)).toBe(true);
  });
});

describe('isOdd', () => {
  test('odd numbers', () => {
    expect(isOdd(1)).toBe(true);
    expect(isOdd(3)).toBe(true);
    expect(isOdd(5)).toBe(true);
    expect(isOdd(-1)).toBe(true);
    expect(isOdd(-3)).toBe(true);
  });

  test('even numbers', () => {
    expect(isOdd(0)).toBe(false);
    expect(isOdd(2)).toBe(false);
    expect(isOdd(4)).toBe(false);
    expect(isOdd(-2)).toBe(false);
  });

  test('invalid inputs', () => {
    expect(isOdd(Number.NaN)).toBeUndefined();
    expect(isOdd('abc')).toBeUndefined();
    expect(isOdd(undefined)).toBeFalsy();
  });

  test('floating point numbers', () => {
    expect(isOdd(1.5)).toBe(true); // Coerced to 1
    expect(isOdd(2.5)).toBe(false); // Coerced to 2
  });
});

describe('median', () => {
  test('odd-length arrays', () => {
    expect(median([1, 2, 3])).toBe(2);
    expect(median([5, 1, 3])).toBe(3);
    expect(median([10, 20, 30, 40, 50])).toBe(30);
  });

  test('even-length arrays', () => {
    expect(median([1, 2, 3, 4])).toBe(2.5);
    expect(median([10, 20])).toBe(15);
    expect(median([1, 2, 2, 3])).toBe(2);
  });

  test('edge cases', () => {
    expect(median([])).toBeUndefined();
    expect(median([1])).toBe(1);
    expect(median([5, 5, 5])).toBe(5);
  });

  test('unsorted arrays', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([100, 1, 50, 25])).toBe(37.5);
  });

  test('negative numbers', () => {
    expect(median([-1, -2, -3])).toBe(-2);
    expect(median([-5, 5])).toBe(0);
  });
});

describe('coerceEven', () => {
  test('odd numbers become even', () => {
    expect(coerceEven(1)).toBe(2);
    expect(coerceEven(3)).toBe(4);
    expect(coerceEven(5)).toBe(6);
  });

  test('even numbers stay even', () => {
    expect(coerceEven(0)).toBe(0);
    expect(coerceEven(2)).toBe(2);
    expect(coerceEven(4)).toBe(4);
  });

  test('edge cases', () => {
    expect(coerceEven(Number.NaN)).toBe(0);
    expect(coerceEven(undefined)).toBe(0);
  });

  test('negative numbers', () => {
    // expect(coerceEven(-1)).toBe(0); // -1 + 1
    expect(coerceEven(-2)).toBe(-2);
    expect(coerceEven(-3)).toBe(-2); // -3 + 1
  });
});

describe('nearestPowerOf2', () => {
  test('rounds to nearest power of 2', () => {
    expect(nearestPowerOf2(3)).toBe(4);
    expect(nearestPowerOf2(5)).toBe(4);
    expect(nearestPowerOf2(6)).toBe(8);
    expect(nearestPowerOf2(10)).toBe(8);
    expect(nearestPowerOf2(12)).toBe(16);
  });

  test('exact powers of 2', () => {
    expect(nearestPowerOf2(2)).toBe(2);
    expect(nearestPowerOf2(4)).toBe(4);
    expect(nearestPowerOf2(8)).toBe(8);
    expect(nearestPowerOf2(16)).toBe(16);
  });

  test('very small values', () => {
    expect(nearestPowerOf2(1)).toBe(1);
    expect(nearestPowerOf2(1.5)).toBe(2);
  });
});

describe('deriveExponent', () => {
  test('derives exponent for powers of 2', () => {
    expect(deriveExponent(2)).toBe(1); // 2^1
    expect(deriveExponent(4)).toBe(2); // 2^2
    expect(deriveExponent(8)).toBe(3); // 2^3
    expect(deriveExponent(16)).toBe(4); // 2^4
    expect(deriveExponent(32)).toBe(5); // 2^5
  });

  test('non-powers of 2 return false', () => {
    expect(deriveExponent(3)).toBe(false);
    expect(deriveExponent(5)).toBe(false);
    expect(deriveExponent(6)).toBe(false);
  });

  test('edge cases', () => {
    expect(deriveExponent(1)).toBe(false); // Special case - infinite loop avoided
    expect(deriveExponent(0)).toBe(false);
    expect(deriveExponent(Number.NaN)).toBe(false);
  });
});

describe('randomInt', () => {
  test('generates integers within range', () => {
    for (let i = 0; i < 100; i++) {
      const result = randomInt(1, 10);
      expect(result).toBeGreaterThanOrEqual(1);
      expect(result).toBeLessThanOrEqual(10);
      expect(Number.isInteger(result)).toBe(true);
    }
  });

  test('handles negative ranges', () => {
    for (let i = 0; i < 50; i++) {
      const result = randomInt(-10, -1);
      expect(result).toBeGreaterThanOrEqual(-10);
      expect(result).toBeLessThanOrEqual(-1);
    }
  });

  test('single value range', () => {
    const result = randomInt(5, 5);
    expect(result).toBe(5);
  });
});

describe('weightedRandom', () => {
  test('generates values within range', () => {
    for (let i = 0; i < 50; i++) {
      const result = weightedRandom(10);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(10);
    }
  });

  test('respects round parameter', () => {
    for (let i = 0; i < 20; i++) {
      const rounded = weightedRandom(10, 3, true);
      expect(Number.isInteger(rounded)).toBe(true);
    }
  });

  test('default parameters', () => {
    const result = weightedRandom();
    expect(result).toBeGreaterThanOrEqual(0);
    expect(result).toBeLessThanOrEqual(1);
  });
});

describe('skewedDistribution', () => {
  test('generates values within range', () => {
    for (let i = 0; i < 50; i++) {
      const result = skewedDistribution(0, 100, 1);
      expect(result).toBeGreaterThanOrEqual(0);
      expect(result).toBeLessThanOrEqual(100);
    }
  });

  test('respects step parameter', () => {
    const result = skewedDistribution(0, 10, 1, 0.5);
    const decimal = result - Math.floor(result);
    // Should be 0, 0.5, or very close
    expect([0, 0.5].some((v) => Math.abs(decimal - v) < 0.01)).toBe(true);
  });

  test('respects significant decimals', () => {
    const result = skewedDistribution(0, 10, 1, undefined, 3);
    const str = result.toString();
    if (str.includes('.')) {
      const decimals = str.split('.')[1].length;
      expect(decimals).toBeLessThanOrEqual(3);
    }
  });
});

describe('fixedDecimals', () => {
  test('rounds to specified decimals', () => {
    expect(fixedDecimals(3.14159, 2)).toBe(3.14);
    expect(fixedDecimals(3.14159, 3)).toBe(3.142);
    expect(fixedDecimals(3.14159, 1)).toBe(3.1);
  });

  test('default to 2 decimals', () => {
    expect(fixedDecimals(3.14159)).toBe(3.14);
    expect(fixedDecimals(1.999)).toBe(2);
  });

  test('handles integers', () => {
    expect(fixedDecimals(5, 2)).toBe(5);
    expect(fixedDecimals(10, 3)).toBe(10);
  });

  test('handles zero', () => {
    expect(fixedDecimals(0, 2)).toBe(0);
  });
});
