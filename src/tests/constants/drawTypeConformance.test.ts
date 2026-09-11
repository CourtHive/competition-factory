import { expect, test } from 'vitest';

import { DrawTypeEnum } from '@Types/tournamentTypes';
import { generatedDrawTypes } from '@Constants/drawDefinitionConstants';

/**
 * `generatedDrawTypes` is what `generateDrawDefinition` accepts; `DrawTypeEnum` is what a TypeScript
 * consumer can NAME, since `DrawTypeUnion` derives from it. Nothing kept them in step, and LADDER
 * was added to the first without the second — leaving a draw type the factory generates but a typed
 * caller cannot declare. Values rather than keys, because CURTIS is an alias for CURTIS_CONSOLATION.
 */
test('every generated drawType is nameable through DrawTypeEnum', () => {
  const nameable = new Set(Object.values(DrawTypeEnum));
  const missing = generatedDrawTypes.filter((drawType) => !nameable.has(drawType as any));
  expect(generatedDrawTypes.length).toBeGreaterThan(0); // a vacuous pass here would hide the point
  expect(missing).toEqual([]);
});
