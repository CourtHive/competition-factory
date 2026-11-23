import assert from 'node:assert/strict';
import { syncEngine } from 'tods-competition-factory';

// Import just a raw function under another name, as a custom assembly can do.
export function checkGovernorPreview(rename) {
  const record = { tournamentId: 'bare', tournamentName: 'original' };
  syncEngine.setState(record, false);
  syncEngine.importMethods({ alias: rename });
  const params = { tournamentName: 'updated' };
  const run = syncEngine.dryRun([{ method: 'alias', params }]);
  assert.equal(run.wouldSucceed, true);
  assert.ok(run.patch.some((op) => op.path === '/bare/tournamentName' && op.value === 'updated'));
  const why = syncEngine.explain('alias', params);
  assert.equal(why.wouldSucceed, true);
  assert.ok(why.touchesPaths.includes('/bare/tournamentName'));
  assert.equal(record.tournamentName, 'original');
  assert.equal(syncEngine.executionQueue([{ method: 'alias', params }], false).success, true);
  assert.equal(record.tournamentName, 'updated');
}
