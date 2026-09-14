import { accumulate } from '@Functions/reducers/accumulate';
import { describe, expect, it } from 'vitest';

describe('accumulate', () => {
  it('accumulates array of numbers', () => {
    expect(accumulate([1, 2, 3, 4, 5])).toBe(15);
  });

  it('handles empty array', () => {
    expect(accumulate([])).toBe(0);
  });

  it('handles array with single element', () => {
    expect(accumulate([42])).toBe(42);
  });

  it('handles array with zeros', () => {
    expect(accumulate([0, 0, 0])).toBe(0);
  });

  it('handles negative numbers', () => {
    expect(accumulate([-1, -2, -3])).toBe(-6);
  });

  it('handles mix of positive and negative', () => {
    expect(accumulate([10, -5, 3, -2])).toBe(6);
  });

  it('filters out non-numeric values', () => {
    expect(accumulate([1, 'two' as any, 3, null as any, 5])).toBe(9);
  });

  it('handles array with only non-numeric values', () => {
    expect(accumulate(['a' as any, 'b' as any, 'c' as any])).toBe(0);
  });

  it('handles array with undefined values', () => {
    expect(accumulate([1, undefined as any, 3])).toBe(4);
  });

  it('handles array with null values', () => {
    expect(accumulate([1, null as any, 3])).toBe(4);
  });

  it('handles array with NaN values', () => {
    expect(accumulate([1, Number.NaN, 3])).toBe(4);
  });

  it('handles array with Infinity', () => {
    expect(accumulate([1, Infinity, 3])).toBe(Infinity);
  });

  it('handles array with -Infinity', () => {
    expect(accumulate([1, -Infinity, 3])).toBe(-Infinity);
  });

  it('handles decimal numbers', () => {
    expect(accumulate([1.5, 2.5, 3.5])).toBe(7.5);
  });

  it('handles very large numbers', () => {
    expect(accumulate([1e10, 2e10, 3e10])).toBe(6e10);
  });

  it('handles very small numbers', () => {
    expect(accumulate([0.0001, 0.0002, 0.0003])).toBeCloseTo(0.0006, 4);
  });

  // Edge cases - non-array inputs
  it('returns 0 for non-array input', () => {
    expect(accumulate('not an array' as any)).toBe(0);
  });

  it('returns 0 for null input', () => {
    expect(accumulate(null as any)).toBe(0);
  });

  it('returns 0 for undefined input', () => {
    expect(accumulate(undefined as any)).toBe(0);
  });

  it('returns 0 for number input', () => {
    expect(accumulate(42 as any)).toBe(0);
  });

  it('returns 0 for object input', () => {
    expect(accumulate({ a: 1, b: 2 } as any)).toBe(0);
  });

  it('handles array-like objects', () => {
    // Array-like but not actually an array
    expect(accumulate({ 0: 1, 1: 2, length: 2 } as any)).toBe(0);
  });

  it('handles sparse arrays', () => {
    const sparse: any = [1, , 3]; // eslint-disable-line no-sparse-arrays
    expect(accumulate(sparse)).toBe(4);
  });

  it('handles array with boolean values', () => {
    expect(accumulate([1, true as any, 3, false as any])).toBe(4);
  });

  it('handles string numbers (parseFloat makes them numeric)', () => {
    // isNumeric uses parseFloat, so '2' is considered numeric
    // But + operator causes string concatenation, so result is '123'
    const result = accumulate([1, '2' as any, 3]);
    expect(typeof result).toBe('string');
    expect(result).toBe('123');
  });

  it('filters out objects', () => {
    expect(accumulate([1, { value: 2 } as any, 3])).toBe(4);
  });

  it('handles arrays (parseFloat coerces them)', () => {
    // parseFloat([2,3]) converts to parseFloat('2,3') which is 2
    // But + operator causes string concatenation
    const result = accumulate([1, [2, 3] as any, 4]);
    expect(typeof result).toBe('string');
  });
});
