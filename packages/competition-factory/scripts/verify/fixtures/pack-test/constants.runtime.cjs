// A real packed-package CJS consumer: no DOM or root engine loaded by the constants subpath.
const assert = require('node:assert/strict');
const before = new Set(Object.keys(globalThis));
const constants = require('tods-competition-factory/constants');
const loaded = Object.keys(require.cache).filter((p) => p.includes('tods-competition-factory'));
assert.ok(loaded.length > 0);
assert.ok(
  loaded.every((p) => /[\\/]dist[\\/]constants[\\/]/.test(p)),
  loaded.join('\n'),
);
assert.deepEqual(
  Object.keys(globalThis).filter((key) => !before.has(key)),
  [],
);
assert.equal(constants.matchUpStatusConstants.COMPLETED, 'COMPLETED');
assert.equal('tournamentEngine' in constants, false);
// Only after checking isolation, load the root to compare its entire constants namespace and named exports.
const root = require('tods-competition-factory');
assert.deepEqual(JSON.parse(JSON.stringify(constants)), JSON.parse(JSON.stringify(root.factoryConstants)));
for (const [name, value] of Object.entries(constants)) {
  assert.deepEqual(JSON.parse(JSON.stringify(value)), JSON.parse(JSON.stringify(root[name])), name);
}
console.log(`[constants cjs] ${Object.keys(constants).length} exports match root; isolated load verified`);
