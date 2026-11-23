import { replacementTest } from '@Tests/mutations/drawDefinitions/structures/byeReplacementStressTest';
import { expect, test } from 'vitest';

// constants
import { COMPASS } from '@Constants/drawDefinitionConstants';

test.each([
  [8, COMPASS, [6, 1, 2, 7]],
  [8, COMPASS, [7, 8, 5, 4]],
  [8, COMPASS, [5, 6, 3, 1]],
  [16, COMPASS, [8, 6, 15, 3, 11, 10, 5, 4]],
])('pass specific bye replacement scenarios', (drawSize, drawType, positionsToReplaceWithBye) => {
  const result = replacementTest({
    drawType,
    drawSize,
    positionsToReplaceWithBye,
  });
  expect(result.success).toEqual(true);
});
