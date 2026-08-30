import { describe, expect, it } from 'vitest';
import { stringSort } from '@Functions/sorters/stringSort';

describe('stringSort', () => {
  it('sorts strings alphabetically', () => {
    const arr = ['zebra', 'apple', 'monkey'];
    arr.sort(stringSort);
    expect(arr).toEqual(['apple', 'monkey', 'zebra']);
  });

  it('sorts empty strings', () => {
    const arr = ['b', '', 'a'];
    arr.sort(stringSort);
    expect(arr).toEqual(['', 'a', 'b']);
  });

  it('handles null values', () => {
    expect(stringSort(null, 'test')).toBeLessThan(0);
    expect(stringSort('test', null)).toBeGreaterThan(0);
    expect(stringSort(null, null)).toBe(0);
  });

  it('handles undefined values', () => {
    expect(stringSort(undefined, 'test')).toBeLessThan(0);
    expect(stringSort('test', undefined)).toBeGreaterThan(0);
    expect(stringSort(undefined, undefined)).toBe(0);
  });

  it('handles mix of null and undefined', () => {
    expect(stringSort(null, undefined)).toBe(0);
    expect(stringSort(undefined, null)).toBe(0);
  });

  it('returns 0 for equal strings', () => {
    expect(stringSort('test', 'test')).toBe(0);
  });

  it('handles case sensitivity with localeCompare', () => {
    // localeCompare behavior is locale-specific
    // Just verify it returns consistent values
    const result1 = stringSort('a', 'B');
    const result2 = stringSort('B', 'a');
    expect(Math.sign(result1)).toBe(-Math.sign(result2));
  });

  it('handles numbers as strings', () => {
    const arr = ['10', '2', '1'];
    arr.sort(stringSort);
    expect(arr).toEqual(['1', '10', '2']); // Lexicographic sort
  });

  it('handles special characters', () => {
    const arr = ['!', '@', '#', 'a'];
    arr.sort(stringSort);
    expect(arr.at(-1)).toBe('a'); // Letters after symbols
  });

  it('handles whitespace', () => {
    const arr = ['  a', ' a', 'a'];
    arr.sort(stringSort);
    expect(arr[0]).toBe('  a'); // More spaces first
  });

  it('handles unicode characters', () => {
    const arr = ['ñ', 'n', 'o'];
    arr.sort(stringSort);
    // Order is now determined: the collator is pinned to 'en', which sorts ñ
    // with n rather than after z the way a Scandinavian locale would.
    expect(arr).toEqual(['n', 'ñ', 'o']);
  });

  it('handles emoji', () => {
    const arr = ['😀', 'a', '😁'];
    arr.sort(stringSort);
    expect(arr).toHaveLength(3);
  });

  it('handles very long strings', () => {
    const long1 = 'a'.repeat(1000);
    const long2 = 'b'.repeat(1000);
    expect(stringSort(long1, long2)).toBeLessThan(0);
  });

  it('handles strings with numbers', () => {
    const arr = ['test1', 'test10', 'test2'];
    arr.sort(stringSort);
    expect(arr).toEqual(['test1', 'test10', 'test2']);
  });

  it('handles strings with mixed case', () => {
    const arr = ['Test', 'test', 'TEST'];
    arr.sort(stringSort);
    expect(arr).toHaveLength(3);
  });

  it('handles only null values', () => {
    const arr = [null, null, null];
    arr.sort(stringSort);
    expect(arr).toEqual([null, null, null]);
  });

  it('handles only undefined values', () => {
    const arr = [undefined, undefined, undefined];
    arr.sort(stringSort);
    expect(arr).toEqual([undefined, undefined, undefined]);
  });

  it('handles mix of empty string and null', () => {
    const arr = ['', null, ''];
    arr.sort(stringSort);
    expect(arr.filter((x) => x === '')).toHaveLength(2);
  });

  it('handles strings that differ only in length', () => {
    const arr = ['aaa', 'a', 'aa'];
    arr.sort(stringSort);
    expect(arr).toEqual(['a', 'aa', 'aaa']);
  });

  it('handles strings with accented characters', () => {
    const arr = ['café', 'cafe', 'cafè'];
    arr.sort(stringSort);
    expect(arr).toEqual(['cafe', 'café', 'cafè']);
  });

  it('handles strings with diacritics', () => {
    const arr = ['naïve', 'naive'];
    arr.sort(stringSort);
    expect(arr).toEqual(['naive', 'naïve']);
  });

  it('is deterministic across host locales', () => {
    // The regression this pin exists for: Scandinavian collation files ö/ä/å
    // after z, English sorts them with o/a. Before the pin, which of these two
    // orderings you got depended on the machine.
    const arr = ['Öberg', 'Olsson', 'Zeballos', 'Ärnold'];
    arr.sort(stringSort);
    expect(arr).toEqual(['Ärnold', 'Öberg', 'Olsson', 'Zeballos']);

    // and the host-default comparator is NOT guaranteed to agree with it
    const swedish = [...arr].sort((a, b) => a.localeCompare(b, 'sv'));
    expect(swedish).toEqual(['Olsson', 'Zeballos', 'Ärnold', 'Öberg']);
  });

  it('is unchanged for the ASCII identifiers its callers actually sort', () => {
    // All production callers sort participantId/matchUpId pair keys,
    // collectionIds and gender constants — every locale agrees on these, which
    // is why pinning is a no-op at runtime.
    const ids = ['p9', 'p10', 'p1', 'MALE', 'FEMALE'];
    const codeUnitOrder = (a: string, b: string) => {
      if (a < b) return -1;
      return a > b ? 1 : 0;
    };
    expect([...ids].sort(stringSort)).toEqual([...ids].sort(codeUnitOrder));
  });

  it('handles empty array', () => {
    const arr: string[] = [];
    arr.sort(stringSort);
    expect(arr).toEqual([]);
  });

  it('handles single element array', () => {
    const arr = ['solo'];
    arr.sort(stringSort);
    expect(arr).toEqual(['solo']);
  });

  it('handles already sorted array', () => {
    const arr = ['a', 'b', 'c'];
    arr.sort(stringSort);
    expect(arr).toEqual(['a', 'b', 'c']);
  });

  it('handles reverse sorted array', () => {
    const arr = ['c', 'b', 'a'];
    arr.sort(stringSort);
    expect(arr).toEqual(['a', 'b', 'c']);
  });
});
