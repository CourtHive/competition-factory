import { it, expect } from 'vitest';

import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';

it('can initialize, setState, and query', () => {
  const drawDefinition = newDrawDefinition({ drawId: 'uuid-xyz' });
  const { drawId } = drawDefinition;
  expect(drawId).toEqual('uuid-xyz');
});
