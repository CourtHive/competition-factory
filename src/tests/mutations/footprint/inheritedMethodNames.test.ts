import { getMethodFootprint } from '@Query/footprint/mutationFootprints';
import { expect, it } from 'vitest';

/**
 * A method name is caller input (an executionQueue directive's `method`). A name the footprint map does not own, such
 * as `constructor` or `toString`, takes the whole-tournament footprint like any unmapped method. Before, the lookup
 * reached Object.prototype and called the function of that name as if it were a footprint rule (CodeQL
 * js/unvalidated-dynamic-method-call): `constructor` returned the params object itself as the footprint.
 */
it.each(['constructor', 'toString', 'hasOwnProperty', 'valueOf', '__proto__'])(
  'an inherited name %s takes the whole-tournament footprint',
  (method) => {
    expect(getMethodFootprint(method, { drawId: 'd1' })).toEqual({ shards: ['tournament'] });
  },
);

it('a mapped method keeps its rule', () => {
  expect(getMethodFootprint('assignDrawPosition', { drawId: 'd1' })).toMatchObject({ drawIds: ['d1'] });
});
