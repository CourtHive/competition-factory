import { generateBlockPattern } from '@Assemblies/generators/drawDefinitions/generateBlockPattern';
import { generateRange } from '@Tools/arrays';
import { expect, test } from 'vitest';

// constants
import { CLUSTER, SEPARATE } from '@Constants/drawDefinitionConstants';

const expectations = {
  2: {
    separatedGroupings: [[1], [2]],
    clusteredGroupings: [[1], [2]],
  },

  4: {
    separatedGroupings: [[1], [3], [2, 4]],
    clusteredGroupings: [[1], [4], [2, 3]],
  },

  6: {
    separatedGroupings: [[1], [4], [5], [2, 3, 6]],
    clusteredGroupings: [[1], [6], [4], [2, 3, 5]],
  },

  8: {
    separatedGroupings: [[1], [5], [3, 7], [2, 4, 6, 8]],
    clusteredGroupings: [[1], [8], [4, 5], [2, 3, 6, 7]],
  },

  10: {
    separatedGroupings: [[1], [6], [3, 7, 9], [2, 4, 5, 8, 10]],
    clusteredGroupings: [[1], [10], [4, 5, 8], [2, 3, 6, 7, 9]],
  },

  12: {
    separatedGroupings: [[1], [7], [4, 10], [5, 11], [2, 3, 6, 8, 9, 12]],
    clusteredGroupings: [[1], [12], [6, 7], [4, 9], [2, 3, 5, 8, 10, 11]],
  },

  14: {
    separatedGroupings: [[1], [8], [3, 5, 9, 11, 13], [2, 4, 6, 7, 10, 12, 14]],
    clusteredGroupings: [[1], [14], [4, 5, 8, 9, 12], [2, 3, 6, 7, 10, 11, 13]],
  },

  16: {
    separatedGroupings: [[1], [9], [5, 13], [3, 7, 11, 15], [2, 4, 6, 8, 10, 12, 14, 16]],
    clusteredGroupings: [[1], [16], [8, 9], [4, 5, 12, 13], [2, 3, 6, 7, 10, 11, 14, 15]],
  },

  18: {
    separatedGroupings: [[1], [10], [3, 5, 7, 11, 13, 15, 17], [2, 4, 6, 8, 9, 12, 14, 16, 18]],
    clusteredGroupings: [[1], [18], [4, 5, 8, 9, 12, 13, 16], [2, 3, 6, 7, 10, 11, 14, 15, 17]],
  },

  20: {
    separatedGroupings: [[1], [11], [6, 16], [3, 7, 9, 13, 17, 19], [2, 4, 5, 8, 10, 12, 14, 15, 18, 20]],
    clusteredGroupings: [[1], [20], [10, 11], [4, 5, 8, 13, 16, 17], [2, 3, 6, 7, 9, 12, 14, 15, 18, 19]],
  },

  22: {
    separatedGroupings: [[1], [12], [3, 5, 7, 9, 13, 15, 17, 19, 21], [2, 4, 6, 8, 10, 11, 14, 16, 18, 20, 22]],
    clusteredGroupings: [[1], [22], [4, 5, 8, 9, 12, 13, 16, 17, 20], [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 21]],
  },

  24: {
    separatedGroupings: [
      [1],
      [13],
      [7, 19],
      [4, 10, 16, 22],
      [5, 11, 17, 23],
      [2, 3, 6, 8, 9, 12, 14, 15, 18, 20, 21, 24],
    ],
    clusteredGroupings: [
      [1],
      [24],
      [12, 13],
      [6, 7, 18, 19],
      [4, 9, 16, 21],
      [2, 3, 5, 8, 10, 11, 14, 15, 17, 20, 22, 23],
    ],
  },

  26: {
    separatedGroupings: [
      [1],
      [14],
      [3, 5, 7, 9, 11, 15, 17, 19, 21, 23, 25],
      [2, 4, 6, 8, 10, 12, 13, 16, 18, 20, 22, 24, 26],
    ],
    clusteredGroupings: [
      [1],
      [26],
      [4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24],
      [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 25],
    ],
  },

  28: {
    separatedGroupings: [
      [1],
      [15],
      [8, 22],
      [3, 5, 9, 11, 13, 17, 19, 23, 25, 27],
      [2, 4, 6, 7, 10, 12, 14, 16, 18, 20, 21, 24, 26, 28],
    ],
    clusteredGroupings: [
      [1],
      [28],
      [14, 15],
      [4, 5, 8, 9, 12, 17, 20, 21, 24, 25],
      [2, 3, 6, 7, 10, 11, 13, 16, 18, 19, 22, 23, 26, 27],
    ],
  },

  30: {
    separatedGroupings: [
      [1],
      [16],
      [3, 5, 7, 9, 11, 13, 17, 19, 21, 23, 25, 27, 29],
      [2, 4, 6, 8, 10, 12, 14, 15, 18, 20, 22, 24, 26, 28, 30],
    ],
    clusteredGroupings: [
      [1],
      [30],
      [4, 5, 8, 9, 12, 13, 16, 17, 20, 21, 24, 25, 28],
      [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27, 29],
    ],
  },

  32: {
    separatedGroupings: [
      [1],
      [17],
      [9, 25],
      [5, 13, 21, 29],
      [3, 7, 11, 15, 19, 23, 27, 31],
      [2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22, 24, 26, 28, 30, 32],
    ],
    clusteredGroupings: [
      [1],
      [32],
      [16, 17],
      [8, 9, 24, 25],
      [4, 5, 12, 13, 20, 21, 28, 29],
      [2, 3, 6, 7, 10, 11, 14, 15, 18, 19, 22, 23, 26, 27, 30, 31],
    ],
  },
};

const divisionScenarios = generateRange(1, 17).map((v) => v * 2);
test.each(divisionScenarios)('divisions are generated propertly', (scenario) => {
  const { divisionGroupings: separatedGroupings } = generateBlockPattern({
    positioning: SEPARATE,
    size: scenario,
  });
  const { divisionGroupings: clusteredGroupings } = generateBlockPattern({
    positioning: CLUSTER,
    size: scenario,
  });
  expect(expectations[scenario].separatedGroupings).toEqual(separatedGroupings);
  expect(expectations[scenario].clusteredGroupings).toEqual(clusteredGroupings);
});
