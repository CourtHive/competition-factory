import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
assert.throws(() => require('tods-competition-factory/operator-types'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
await assert.rejects(import('tods-competition-factory/operator-types'), { code: 'ERR_PACKAGE_PATH_NOT_EXPORTED' });
const { readModel } = await import('tods-competition-factory');
assert.deepEqual(
  readModel.operatorDrawPresentation({ drawId: 'd', structureId: 's', matchUps: [] }).presentation.rounds,
  [],
);
assert.equal(
  readModel.operatorDrawPresentation({
    drawId: 'd',
    structureId: 's',
    matchUps: [{ matchUpId: 'unrounded', drawId: 'd', structureId: 's' }],
  }).presentation,
  undefined,
  'unrounded input must not become a successful empty draw',
);
console.log('[operator-types] declarations resolve in both formats; runtime imports refused; producer export works');
