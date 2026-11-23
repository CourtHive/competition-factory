import { replacementTest } from '@Tests/mutations/drawDefinitions/structures/byeReplacementStressTest';
import { expect, test } from 'vitest';

// constants
import { CURTIS_CONSOLATION } from '@Constants/drawDefinitionConstants';

test.each([
  [8, CURTIS_CONSOLATION, [8, 7, 4, 6]],
  [16, CURTIS_CONSOLATION, [15, 16, 13, 7, 14, 11, 10, 12]],
  [16, CURTIS_CONSOLATION, [4, 2, 1, 3, 13, 14, 11, 6]],
  [16, CURTIS_CONSOLATION, [1, 8, 5, 16, 7, 3, 4, 15]],
  [16, CURTIS_CONSOLATION, [16, 12, 9, 3, 6, 15, 7, 10]],
  [32, CURTIS_CONSOLATION, [3, 18, 27, 8, 14, 28, 11, 1, 16, 25, 2, 26, 17, 10, 31, 6]],
  [32, CURTIS_CONSOLATION, [1, 2, 3, 6, 8, 10, 11, 14, 16, 17, 18, 25, 26, 27, 28, 31]],
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
