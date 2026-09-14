import { replacementTest } from '@Tests/mutations/drawDefinitions/structures/byeReplacementStressTest';
import { expect, test } from 'vitest';

// constants
import { FEED_IN_CHAMPIONSHIP } from '@Constants/drawDefinitionConstants';

test.each([
  [8, FEED_IN_CHAMPIONSHIP, [2, 4, 5, 6]],
  [8, FEED_IN_CHAMPIONSHIP, [7, 5, 6, 8]],
  [8, FEED_IN_CHAMPIONSHIP, [1, 2, 4, 3]],
  [8, FEED_IN_CHAMPIONSHIP, [7, 3, 1, 8]],
  [8, FEED_IN_CHAMPIONSHIP, [1, 7, 8, 5]],
  [8, FEED_IN_CHAMPIONSHIP, [3, 2, 5, 6]],
  [8, FEED_IN_CHAMPIONSHIP, [4, 6, 5, 3]],
  [8, FEED_IN_CHAMPIONSHIP, [3, 2, 7, 8]],
  [16, FEED_IN_CHAMPIONSHIP, [15, 7, 1, 10, 11, 13, 16, 8]],
  [16, FEED_IN_CHAMPIONSHIP, [6, 15, 4, 1, 3, 12, 5, 9]],
])('pass specific bye replacement scenarios', (drawSize, drawType, positionsToReplaceWithBye) => {
  const result = replacementTest({
    drawType,
    drawSize,
    positionsToReplaceWithBye,
  });
  if (!result.success) {
    console.log('FAILED', { drawSize, drawType, positionsToReplaceWithBye });
  }
  expect(result.success).toEqual(true);
});
