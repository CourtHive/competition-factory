/**
 * TEST SUITE: src/tools/arrays.ts
 * Target Coverage: 100%
 * Expanded from: coverage-plan/arrays.test.stub.ts
 */

import {
  lengthOrZero,
  unique,
  noNulls,
  shuffleArray,
  numericSortValue,
  instanceCount,
  countValues,
  groupValues,
  uniqueValues,
  randomPop,
  randomMember,
  generateRange,
  sizedRange,
  arrayIndices,
  intersection,
  difference,
  symmetricDifference,
  overlap,
  occurrences,
  subSort,
  inPlaceSubSort,
  chunkArray,
  chunkSizeProfile,
  groupConsecutiveNumbers,
  allNumeric,
  noNumeric,
  chunkByNth,
  getRanges,
  getMissingSequenceNumbers,
} from '@Tools/arrays';
import { expect, test, describe } from 'vitest';

// ============================================================================
// FUNCTION 1: unique
// ============================================================================
describe('unique', () => {
  test('should return unique values', () => {
    expect(unique([1, 2, 2, 3, 3, 3])).toEqual([1, 2, 3]);
    expect(unique([1, 1, 1])).toEqual([1]);
  });

  test('should handle empty array', () => {
    expect(unique([])).toEqual([]);
  });

  test('should return empty array for non-array input', () => {
    expect(unique(null)).toEqual([]);
    expect(unique(undefined)).toEqual([]);
    expect(unique('string')).toEqual([]);
    expect(unique(123)).toEqual([]);
  });

  test('should work with different types', () => {
    expect(unique(['a', 'b', 'a'])).toEqual(['b', 'a']);
    expect(unique([1, '1', 1])).toEqual(['1', 1]);
  });
});

// ============================================================================
// FUNCTION 2: noNulls
// ============================================================================
describe('noNulls', () => {
  test('should convert null to undefined', () => {
    expect(noNulls([1, null, 3])).toEqual([1, undefined, 3]);
    expect(noNulls([null, null])).toEqual([undefined, undefined]);
  });

  test('should preserve other values', () => {
    expect(noNulls([1, 2, 3])).toEqual([1, 2, 3]);
    expect(noNulls(['a', 'b'])).toEqual(['a', 'b']);
  });

  test('should return input if not an array', () => {
    expect(noNulls(null)).toBe(null);
    expect(noNulls('string')).toBe('string');
    expect(noNulls(123)).toBe(123);
  });
});

// ============================================================================
// FUNCTION 3: shuffleArray
// ============================================================================
describe('shuffleArray', () => {
  test('should return array with same length', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled).toHaveLength(arr.length);
  });

  test('should return array with same elements', () => {
    const arr = [1, 2, 3, 4, 5];
    const shuffled = shuffleArray(arr);
    expect(shuffled.sort()).toEqual(arr.sort());
  });

  test('should not mutate original array', () => {
    const arr = [1, 2, 3];
    const original = [...arr];
    shuffleArray(arr);
    expect(arr).toEqual(original);
  });

  test('should return empty array for non-array input', () => {
    expect(shuffleArray(null)).toEqual([]);
    expect(shuffleArray(undefined)).toEqual([]);
  });

  test('should handle single element array', () => {
    expect(shuffleArray([1])).toEqual([1]);
  });
});

// ============================================================================
// FUNCTION 4: numericSortValue
// ============================================================================
describe('numericSortValue', () => {
  test('should return number for convertible integers', () => {
    expect(numericSortValue(5)).toBe(5);
    expect(numericSortValue(0)).toBe(0);
    expect(numericSortValue(-10)).toBe(-10);
  });

  test('should return Infinity for non-numeric values', () => {
    expect(numericSortValue('abc')).toBe(Infinity);
    expect(numericSortValue(null)).toBe(Infinity);
    expect(numericSortValue(undefined)).toBe(Infinity);
    expect(numericSortValue({})).toBe(Infinity);
  });
});

// ============================================================================
// FUNCTIONS 5-7: instanceCount, countValues, groupValues
// ============================================================================
describe('instanceCount', () => {
  test('should count occurrences of each value', () => {
    expect(instanceCount([1, 2, 2, 3, 3, 3])).toEqual({
      1: 1,
      2: 2,
      3: 3,
    });
  });

  test('should handle strings', () => {
    expect(instanceCount(['a', 'b', 'a'])).toEqual({
      a: 2,
      b: 1,
    });
  });

  test('should return empty object for non-array', () => {
    expect(instanceCount(null)).toEqual({});
    expect(instanceCount(undefined)).toEqual({});
  });

  test('should handle empty array', () => {
    expect(instanceCount([])).toEqual({});
  });
});

describe('countValues', () => {
  test('should group keys by their count values', () => {
    expect(countValues([1, 2, 2, 3, 4, 4, 5])).toEqual({
      1: ['1', '3', '5'],
      2: ['2', '4'],
    });
  });
});

describe('groupValues', () => {
  test('should group object keys by their values', () => {
    expect(groupValues({ 1: 1, 2: 2, 3: 1, 4: 2, 5: 1 })).toEqual({
      1: ['1', '3', '5'],
      2: ['2', '4'],
    });
  });

  test('should handle empty object', () => {
    expect(groupValues({})).toEqual({});
  });
});

// ============================================================================
// FUNCTIONS 8-9: uniqueValues, randomPop, randomMember
// ============================================================================
describe('uniqueValues', () => {
  test('should return unique values', () => {
    expect(uniqueValues([1, 2, 2, 3])).toEqual([1, 2, 3]);
  });
});

describe('randomPop', () => {
  test('should remove and return random element', () => {
    const arr = [1, 2, 3, 4, 5];
    const arrCopy = [...arr];
    const popped = randomPop(arr);

    expect(arrCopy).toContain(popped);
    expect(arr).toHaveLength(4);
    expect(arr).not.toContain(popped);
  });

  test('should return undefined for empty array', () => {
    expect(randomPop([])).toBeUndefined();
  });

  test('should return undefined for non-array', () => {
    expect(randomPop(null)).toBeUndefined();
    expect(randomPop(undefined)).toBeUndefined();
  });
});

describe('randomMember', () => {
  test('should return element from array', () => {
    const arr = [1, 2, 3];
    const member = randomMember(arr);
    expect(arr).toContain(member);
  });

  test('should not mutate array', () => {
    const arr = [1, 2, 3];
    const original = [...arr];
    randomMember(arr);
    expect(arr).toEqual(original);
  });
});

// ============================================================================
// FUNCTIONS 10-11: generateRange, sizedRange
// ============================================================================
describe('generateRange', () => {
  test('should generate range from start to end', () => {
    expect(generateRange(0, 5)).toEqual([0, 1, 2, 3, 4]);
    expect(generateRange(5, 10)).toEqual([5, 6, 7, 8, 9]);
  });

  test('should handle negative ranges', () => {
    expect(generateRange(-3, 2)).toEqual([-3, -2, -1, 0, 1]);
  });

  test('should return empty array when start >= end', () => {
    expect(generateRange(5, 5)).toEqual([]);
    expect(generateRange(10, 5)).toEqual([]);
  });
});

describe('sizedRange', () => {
  test('should generate range of specific size', () => {
    expect(sizedRange(5, 0)).toEqual([0, 1, 2, 3, 4]);
    expect(sizedRange(3, 10)).toEqual([10, 11, 12]);
  });

  test('should handle zero size', () => {
    expect(sizedRange(0, 5)).toEqual([]);
  });
});

// ============================================================================
// FUNCTION 12: arrayIndices
// ============================================================================
describe('arrayIndices', () => {
  test('should return indices of all occurrences', () => {
    expect(arrayIndices(2, [1, 2, 3, 2, 4, 2])).toEqual([1, 3, 5]);
  });

  test('should return empty array if value not found', () => {
    expect(arrayIndices(99, [1, 2, 3])).toEqual([]);
  });

  test('should handle first and last positions', () => {
    expect(arrayIndices(5, [5, 1, 2, 5])).toEqual([0, 3]);
  });
});

// ============================================================================
// FUNCTIONS 13-16: Set Operations
// ============================================================================
describe('intersection', () => {
  test('should return common elements', () => {
    expect(intersection([1, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  test('should remove duplicates', () => {
    expect(intersection([1, 2, 2, 3], [2, 3, 4])).toEqual([2, 3]);
  });

  test('should return empty array for non-arrays', () => {
    expect(intersection(null, [1, 2])).toEqual([]);
    expect(intersection([1, 2], null)).toEqual([]);
  });

  test('should handle empty arrays', () => {
    expect(intersection([], [1, 2])).toEqual([]);
  });
});

describe('difference', () => {
  test('should return elements in first array but not second', () => {
    expect(difference([1, 2, 3], [2, 3, 4])).toEqual([1]);
    expect(difference([1, 2, 3, 4], [3, 4, 5])).toEqual([1, 2]);
  });

  test('should return empty for non-arrays', () => {
    expect(difference(null, [1])).toEqual([]);
  });
});

describe('symmetricDifference', () => {
  test('should return elements in either array but not both', () => {
    expect(symmetricDifference([1, 2, 3], [2, 3, 4])).toEqual([1, 4]);
  });

  test('should handle empty arrays', () => {
    expect(symmetricDifference([], [1, 2])).toEqual([1, 2]);
  });
});

describe('overlap', () => {
  test('should return true if arrays have common elements', () => {
    expect(overlap([1, 2], [2, 3])).toBe(true);
  });

  test('should return false if no common elements', () => {
    expect(overlap([1, 2], [3, 4])).toBe(false);
  });

  test('should return false for non-arrays', () => {
    expect(overlap(null, [1, 2])).toBe(false);
  });
});

// ============================================================================
// FUNCTION 17: occurrences
// ============================================================================
describe('occurrences', () => {
  test('should count occurrences of value in array', () => {
    expect(occurrences(2, [1, 2, 2, 3, 2])).toBe(3);
  });

  test('should return 0 if value not found', () => {
    expect(occurrences(99, [1, 2, 3])).toBe(0);
  });

  test('should return 0 for non-array', () => {
    expect(occurrences(1, null)).toBe(0);
  });
});

// ============================================================================
// FUNCTIONS 18-19: subSort, inPlaceSubSort
// ============================================================================
describe('subSort', () => {
  test('should sort a subsection of array', () => {
    const arr = [1, 5, 3, 2, 4];
    expect(subSort(arr, 1, 3, (a, b) => a - b)).toEqual([1, 2, 3, 5, 4]);
  });

  test('should not mutate original array', () => {
    const arr = [1, 5, 3, 2, 4];
    const original = [...arr];
    subSort(arr, 1, 3, (a, b) => a - b);
    expect(arr).toEqual(original);
  });

  test('should return empty array for non-array', () => {
    expect(subSort(null, 0, 1, (a, b) => a - b)).toEqual([]);
  });
});

describe('inPlaceSubSort', () => {
  test('should sort subsection in place', () => {
    const arr = [1, 5, 3, 2, 4];
    inPlaceSubSort(arr, 1, 3, (a, b) => a - b);
    expect(arr).toEqual([1, 2, 3, 5, 4]);
  });

  test('should mutate original array', () => {
    const arr = [1, 5, 3, 2, 4];
    const result = inPlaceSubSort(arr, 1, 3, (a, b) => a - b);
    expect(result).toBe(arr);
  });
});

// ============================================================================
// FUNCTIONS 20-22: Chunking Functions
// ============================================================================
describe('chunkArray', () => {
  test('should split array into chunks of specified size', () => {
    expect(chunkArray([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunkArray([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 2, 3],
      [4, 5, 6],
    ]);
  });

  test('should return empty array for non-array', () => {
    expect(chunkArray(null, 2)).toEqual([]);
  });

  test('should handle chunk size larger than array', () => {
    expect(chunkArray([1, 2, 3], 10)).toEqual([[1, 2, 3]]);
  });
});

describe('chunkSizeProfile', () => {
  test('should chunk array by size profile', () => {
    expect(chunkSizeProfile([1, 2, 3, 4, 5, 6], [2, 3])).toEqual([[1, 2], [3, 4, 5], [6]]);
  });

  test('should handle empty array', () => {
    expect(chunkSizeProfile([], [2, 3])).toEqual([]);
  });
});

describe('chunkByNth', () => {
  test('should distribute elements across N chunks', () => {
    expect(chunkByNth([1, 2, 3, 4, 5, 6], 3)).toEqual([
      [1, 4],
      [2, 5],
      [3, 6],
    ]);
  });

  test('should shuttle when shuttle=true', () => {
    const arr = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12];
    expect(chunkByNth(arr, 3, true)).toEqual([
      [1, 6, 7, 12],
      [2, 5, 8, 11],
      [3, 4, 9, 10],
    ]);
  });

  test('should return empty array for non-array', () => {
    expect(chunkByNth(null, 3)).toEqual([]);
  });
});

// ============================================================================
// FUNCTION 23: groupConsecutiveNumbers
// ============================================================================
describe('groupConsecutiveNumbers', () => {
  test('should group consecutive numbers', () => {
    expect(groupConsecutiveNumbers([1, 2, 3, 5, 6, 8])).toEqual([[1, 2, 3], [5, 6], [8]]);
  });

  test('should handle single numbers', () => {
    expect(groupConsecutiveNumbers([1, 3, 5])).toEqual([[1], [3], [5]]);
  });

  test('should handle empty array', () => {
    expect(groupConsecutiveNumbers([])).toEqual([]);
  });
});

// ============================================================================
// FUNCTIONS 24-25: allNumeric, noNumeric
// ============================================================================
describe('allNumeric', () => {
  test('should return true if all elements are numeric', () => {
    expect(allNumeric([1, 2, 3])).toBe(true);
    expect(allNumeric(['1', '2', '3'])).toBe(true);
  });

  test('should return false if any element is non-numeric', () => {
    expect(allNumeric([1, 'abc', 3])).toBe(false);
  });

  test('should return false for non-array', () => {
    expect(allNumeric(null)).toBe(false);
  });
});

describe('noNumeric', () => {
  test('should return true if no elements are numeric', () => {
    expect(noNumeric(['abc', 'def'])).toBe(true);
  });

  test('should return false if any element is numeric', () => {
    expect(noNumeric(['abc', '1', 'def'])).toBe(false);
  });

  test('should return false for non-array', () => {
    expect(noNumeric(null)).toBe(false);
  });
});

// ============================================================================
// FUNCTION 26: getRanges
// ============================================================================
describe('getRanges', () => {
  test('should group consecutive numbers into ranges', () => {
    expect(getRanges([1, 2, 3, 5, 6, 8, 9, 10])).toEqual([
      [1, 2, 3],
      [5, 6],
      [8, 9, 10],
    ]);
  });

  test('should filter non-numeric values', () => {
    expect(getRanges([1, 'a', 2, 3])).toEqual([[1, 2, 3]]);
  });

  test('should handle empty array', () => {
    expect(getRanges([])).toEqual([]);
  });
});

// ============================================================================
// FUNCTION 27: getMissingSequenceNumbers
// ============================================================================
describe('getMissingSequenceNumbers', () => {
  test('should find missing numbers in sequence', () => {
    expect(getMissingSequenceNumbers([1, 2, 4, 5])).toEqual([3]);
    expect(getMissingSequenceNumbers([1, 5, 10])).toEqual([2, 3, 4, 6, 7, 8, 9]);
  });

  test('should use custom start value', () => {
    expect(getMissingSequenceNumbers([5, 7], 1)).toEqual([1, 2, 3, 4, 6]);
  });

  test('should return empty array for non-numeric arrays', () => {
    expect(getMissingSequenceNumbers(['a', 'b'])).toEqual([]);
  });

  test('should return empty array for non-array', () => {
    expect(getMissingSequenceNumbers(null)).toEqual([]);
  });
});

// ============================================================================
// FUNCTION 28: lengthOrZero (EXISTING TESTS)
// ============================================================================
describe('lengthOrZero', () => {
  test('should return length of array', () => {
    expect(lengthOrZero([1])).toEqual(1);
    expect(lengthOrZero([1, 2])).toEqual(2);
  });

  test('should return 0 for empty array', () => {
    expect(lengthOrZero([])).toEqual(0);
  });

  test('should return 0 for non-array', () => {
    expect(lengthOrZero('')).toEqual(0);
    // @ts-expect-error missing params
    expect(lengthOrZero()).toEqual(0);
  });
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================
describe('Integration Tests', () => {
  test('unique + sort workflow', () => {
    const arr = [3, 1, 2, 1, 3, 2];
    expect(unique(arr).sort((a, b) => a - b)).toEqual([1, 2, 3]);
  });

  test('instanceCount + groupValues + countValues workflow', () => {
    const arr = [1, 2, 2, 3, 3, 3];
    const counts = instanceCount(arr);
    const grouped = groupValues(counts);
    expect(grouped).toEqual({ 1: ['1'], 2: ['2'], 3: ['3'] });
  });

  test('intersection + difference workflow', () => {
    const a = [1, 2, 3, 4];
    const b = [3, 4, 5, 6];
    const common = intersection(a, b);
    const aOnly = difference(a, b);
    const bOnly = difference(b, a);

    expect(common).toEqual([3, 4]);
    expect(aOnly).toEqual([1, 2]);
    expect(bOnly).toEqual([5, 6]);
  });
});

// ============================================================================
// PERFORMANCE TESTS
// ============================================================================
describe('Performance', () => {
  test('unique should handle large arrays efficiently', () => {
    const largeArray = Array.from({ length: 100000 }, (_, i) => i % 1000);
    const start = Date.now();
    const result = unique(largeArray);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(500);
    expect(result).toHaveLength(1000);
  });

  test('chunkByNth should handle large arrays', () => {
    const largeArray = Array.from({ length: 10000 }, (_, i) => i);
    const start = Date.now();
    const chunks = chunkByNth(largeArray, 10);
    const duration = Date.now() - start;

    expect(duration).toBeLessThan(250);
    expect(chunks).toHaveLength(10);
  });
});
