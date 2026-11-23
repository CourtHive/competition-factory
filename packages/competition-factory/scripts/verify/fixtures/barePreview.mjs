import assert from 'node:assert/strict';
import { globalState, syncEngine } from 'tods-competition-factory';

const record = { tournamentId: 'bare', tournamentName: 'original' };
syncEngine.setState(record, false);
let clockReads = 0;
syncEngine.setClock(() => {
  clockReads++;
  return 1_000;
});
syncEngine.devContext({ perf: true });
const logs = [];
globalState.setGlobalLog(({ log }) => logs.push(log));
let deliveries = 0;
const topic = 'modifyTournamentDetail';
globalState.setSubscriptions({ subscriptions: { [topic]: () => deliveries++ } });
globalState.addNotice({ topic, payload: { tournamentId: 'bare' } });
const pending = globalState.getNoticeBuffer();
const readsBeforePreview = clockReads;
const preview = syncEngine.dryRun([]);
assert.deepEqual(preview, {
  wouldSucceed: true,
  rolledBack: true,
  patch: [],
  results: [],
  willEmitNotices: [{ topic, payloads: [{ tournamentId: 'bare' }] }],
});
assert.equal(clockReads, readsBeforePreview + 1);
assert.equal(logs.filter((log) => log.dryRun && log.methods === 0 && log.patchOps === 0).length, 1);
const remaining = globalState.getNoticeBuffer();
assert.equal(remaining.length, pending.length);
assert.equal(remaining[0], pending[0]);
assert.equal(deliveries, 0);
assert.equal(globalState.getTournamentRecord('bare'), record);

let calls = 0;
syncEngine.importMethods({ custom: () => calls++ });
assert.equal(syncEngine.explain('custom').reason.code, 'ERR_UNREGISTERED_PREVIEW_METHOD');
assert.equal(calls, 0);
syncEngine.reset();
assert.deepEqual(syncEngine.getState().tournamentRecords, {});
