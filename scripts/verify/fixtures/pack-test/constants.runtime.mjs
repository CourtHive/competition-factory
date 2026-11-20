import assert from 'node:assert/strict';

const before = new Set(Object.keys(globalThis));
const constants = await import('tods-competition-factory/constants');
assert.deepEqual(
  Object.keys(globalThis).filter((key) => !before.has(key)),
  [],
);
assert.equal(constants.matchUpStatusConstants.COMPLETED, 'COMPLETED');
assert.equal('tournamentEngine' in constants, false);
const root = await import('tods-competition-factory');
assert.deepEqual(JSON.parse(JSON.stringify(constants)), JSON.parse(JSON.stringify(root.factoryConstants)));
for (const [name, value] of Object.entries(constants)) {
  assert.deepEqual(JSON.parse(JSON.stringify(value)), JSON.parse(JSON.stringify(root[name])), name);
}
console.log(`[constants esm] ${Object.keys(constants).length} exports match root`);
