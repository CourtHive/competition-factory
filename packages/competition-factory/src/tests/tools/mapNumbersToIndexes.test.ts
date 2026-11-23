import { mapNumbersToIndexes } from '@Tools/mapNumbersToIndexes';
import { describe, expect, test } from 'vitest';

describe('mapRandomNumberArrayToIndexArray()', () => {
  test.each([
    [
      [0, 1, 2, 3],
      [12, 12, 13, 11],
      [1, 2, 0, 3],
    ],
    [
      [0, 1, 2, 3],
      [6, 5, 4, 3, 2, 1, 0],
      [3, 2, 1, 0],
    ],
    [[0, 1, 2, 3], [], [0, 1, 2, 3]],
    [
      [0, 1],
      [12, 10, 13, 11],
      [1, 0],
    ],
    [
      [0, 1],
      [0, 1],
      [0, 1],
    ],
    [
      [0, 1],
      [1, 0],
      [1, 0],
    ],
    [[0], [12, 10, 13], [0]],
    [
      [0, 1, 2],
      [12, 10, 13, 11],
      [1, 0, 2],
    ],
    [
      [0, 1, 2],
      [12, 11],
      [1, 0, 2],
    ],
    [
      [0, 1, 2],
      [1, 0, 2],
      [1, 0, 2],
    ],
    [
      [0, 1, 2, 3],
      [10, 20, 30, 40],
      [0, 1, 2, 3],
    ],
    [
      [0, 1, 2, 3, 4, 5],
      [6, 7, 8],
      [0, 1, 2, 3, 4, 5],
    ],
    [
      [0, 1, 2, 3],
      [12, 10, 14, 11],
      [2, 0, 3, 1],
    ],
    [
      [0, 1, 2, 3],
      [5, 7, 8],
      [0, 1, 2, 3],
    ],
    [
      [0, 1, 2, 3],
      [5, 4],
      [1, 0, 2, 3],
    ],
    [
      [0, 1, 2, 3],
      [10, 12, 14, 16],
      [0, 1, 2, 3],
    ],
    [
      [0, 1, 2],
      [12, 10, 13, 14],
      [1, 0, 2],
    ],
    [
      [0, 1],
      [15, 14],
      [1, 0],
    ],
    [[0, 1, 2], [], [0, 1, 2]],
  ])('when indexArray is %s and numberList is %s, should return %s', (baseList, randomList, expectedResult) => {
    const result = mapNumbersToIndexes(baseList, randomList);
    expect(result).toEqual(expectedResult);
  });

  // Edge case tests for full coverage
  test('handles empty indexArray', () => {
    const result = mapNumbersToIndexes([], [1, 2, 3]);
    expect(result).toEqual([]);
  });

  test('handles single element arrays', () => {
    const result = mapNumbersToIndexes([0], [5]);
    expect(result).toEqual([0]);
  });

  test('handles duplicate numbers in randNumberArray', () => {
    const result = mapNumbersToIndexes([0, 1, 2], [5, 5, 5]);
    expect(result).toEqual([0, 1, 2]);
  });

  test('handles negative numbers', () => {
    const result = mapNumbersToIndexes([0, 1, 2], [-1, -2, -3]);
    expect(result.length).toBe(3);
  });

  test('handles randomList shorter than indexArray', () => {
    const result = mapNumbersToIndexes([0, 1, 2, 3, 4], [10, 20]);
    expect(result.length).toBe(5);
  });

  test('handles randomList longer than indexArray', () => {
    const result = mapNumbersToIndexes([0, 1], [10, 20, 30, 40, 50]);
    expect(result.length).toBe(2);
  });
});
