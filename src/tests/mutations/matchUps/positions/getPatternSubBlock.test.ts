import { getSubBlock } from '@Helpers/seeding/generateBlockPattern';
import { generateRange } from '@Tools/arrays';
import { expect, test } from 'vitest';

const scenarios = [
  {
    blockPattern: [[1], [5], [3, 7], [2, 4, 6, 8]],
    expectation: [
      [0, [1]],
      [1, [5]],
      [2, [3, 7]],
      [3, [3, 7]],
      [4, [2, 4, 6, 8]],
      [5, [2, 4, 6, 8]],
      [6, [2, 4, 6, 8]],
      [7, [2, 4, 6, 8]],
    ],
  },
];

test.each(scenarios)('extract sub-block from block pattern', (scenario) => {
  const { blockPattern } = scenario;
  const totalLength = blockPattern.flat(Infinity).length;
  const result: any[] = [];
  for (const index of generateRange(0, totalLength)) {
    const block = getSubBlock({ blockPattern, index });
    result.push([index, block]);
  }
  expect(scenario.expectation).toEqual(result);
});
