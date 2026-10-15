import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { randomSource, setRandomSource } from '@Tools/prng';
import syncGlobalState from '@Global/state/syncGlobalState';
import syncEngine from '@Engines/syncEngine';
import { UUID } from '@Tools/UUID';
import {
  addNotice,
  cycleMutationStatus,
  deleteNotices,
  getNoticeBuffer,
  getTournamentRecords,
  setDeepCopy,
  setStateProvider,
  setSubscriptions,
} from '@Global/state/globalState';

// constants
import { ROLLBACK_UNAVAILABLE } from '@Constants/errorConditionConstants';

// dryRun's contract, demonstrated with trivial methods: a preview leaves the engine exactly as it
// found it, receives the inputs the commit would receive, and leaves a seeded random stream where it
// was, so the commit that follows draws what the preview showed.

const TOPIC = 'previewIntegrity';
let delivered: any[] = [];

const methods = {
  write: ({ tournamentRecord, name }) => {
    tournamentRecord.tournamentName = name;
    tournamentRecord.extra = { nested: { name } };
    addNotice({ topic: TOPIC, payload: { name } });
    return { success: true };
  },
  refuse: () => ({ error: { message: 'refused', code: 'ERR_REFUSED' } }),
  boom: ({ tournamentRecord }) => {
    tournamentRecord.tournamentName = 'thrown';
    throw new Error('boom');
  },
  addObject: ({ tournamentRecord, key, name }) => {
    tournamentRecord[key] = { nested: { name } };
    return { success: true };
  },
  inputs: ({ random, nonRandom }) => ({ success: true, random: typeof random, nonRandom }),
  mint: ({ tournamentRecord }) => {
    const ids = [UUID(), UUID()];
    tournamentRecord.minted = ids;
    return { success: true, ids, draw: randomSource()() };
  },
};
syncEngine.importMethods(methods);

/** Everything a preview could leave behind. */
const observable = () => ({
  records: structuredClone(getTournamentRecords()),
  tournamentId: syncEngine.getTournamentId(),
  notices: getNoticeBuffer(),
});

beforeEach(() => {
  setStateProvider(syncGlobalState);
  syncEngine.setState([
    { tournamentId: 'T', tournamentName: 'original' },
    { tournamentId: 'U', tournamentName: 'other' },
    { tournamentId: 'V', tournamentName: 'third' },
  ]);
  syncEngine.setTournamentId('T');
  deleteNotices();
  cycleMutationStatus();
  delivered = [];
  setSubscriptions({ subscriptions: { [TOPIC]: (payloads) => delivered.push(...payloads) } });
  // an enclosing operation's notice, which no preview may take
  syncEngine.write({ name: 'delayed', delayNotify: true });
});

afterEach(() => {
  syncEngine.devContext(false);
  setDeepCopy(true, { ignore: [] });
  setRandomSource();
  setSubscriptions({ subscriptions: {} });
});

describe('a preview leaves the engine exactly as it found it', () => {
  const previews: [string, any[]][] = [
    ['a successful preview', [{ method: 'write', params: { name: 'previewed' } }]],
    ['a refused preview', [{ method: 'write', params: { name: 'previewed' } }, { method: 'refuse' }]],
    ['a malformed preview', [{ method: 'write', params: { name: 'previewed' } }, null]],
  ];

  it.each(previews)('%s', (_, directives) => {
    const before = observable();
    syncEngine.dryRun(directives);
    expect(observable()).toEqual(before);
    expect(cycleMutationStatus()).toEqual(false);

    // the enclosing operation's notice is delivered once, by the next real call, and nothing else is
    syncEngine.executionQueue([{ method: 'inputs' }]);
    expect(delivered).toEqual([{ name: 'delayed' }]);
  });

  it('a method that throws under devContext is restored before the error surfaces', () => {
    const before = observable();
    syncEngine.devContext(true);
    expect(() => syncEngine.dryRun([{ method: 'write', params: { name: 'previewed' } }, { method: 'boom' }])).toThrow(
      'boom',
    );
    syncEngine.devContext(false);
    expect(observable()).toEqual(before);
  });

  it('still reports what would fire', () => {
    const result: any = syncEngine.dryRun([{ method: 'write', params: { name: 'previewed' } }]);
    expect(result.wouldSucceed).toEqual(true);
    expect(result.willEmitNotices).toEqual([{ topic: TOPIC, payloads: [{ name: 'delayed' }, { name: 'previewed' }] }]);
  });

  it('refuses before running when the snapshot could not be restored', () => {
    setDeepCopy(true, { ignore: ['tournamentId'] });
    const result: any = syncEngine.dryRun([{ method: 'write', params: { name: 'previewed' } }]);
    setDeepCopy(true, { ignore: [] });
    expect(result.wouldSucceed).toEqual(false);
    expect(result.error).toEqual(ROLLBACK_UNAVAILABLE);
    expect(syncEngine.getTournament().tournamentRecord.tournamentName).toEqual('delayed'); // as beforeEach left it
  });
});

describe('a preview receives the inputs the commit would receive', () => {
  it('the nonRandom seed becomes a random function in both', () => {
    const directives = [{ method: 'inputs', params: { nonRandom: 123 } }];
    const preview: any = syncEngine.dryRun(directives);
    const commit: any = syncEngine.executionQueue(directives);
    expect(preview.results[0]).toEqual(commit.results[0]);
    expect(preview.results[0].random).toEqual('function');
    expect(preview.results[0].nonRandom).toBeUndefined();
  });

  it('an unknown method is refused with the code the commit would return', () => {
    const preview: any = syncEngine.dryRun([{ method: 'noSuchMethod' }]);
    const commit: any = syncEngine.executionQueue([{ method: 'noSuchMethod' }]);
    expect(preview.error.code).toEqual(commit.error.code);
  });
});

describe('a seeded random stream is forked for the preview, not advanced', () => {
  it('the commit draws exactly what the preview showed, without a repeated-id refusal', () => {
    setRandomSource(20261014);
    const preview: any = syncEngine.dryRun([{ method: 'mint' }]);
    const commit: any = syncEngine.executionQueue([{ method: 'mint' }]);
    expect(commit.success).toEqual(true);
    expect(commit.results[0].ids).toEqual(preview.results[0].ids);
    expect(commit.results[0].draw).toEqual(preview.results[0].draw);
  });

  it('the original stream continues as if no preview had run', () => {
    setRandomSource(7);
    const control = [randomSource()(), randomSource()()];
    setRandomSource(7);
    syncEngine.dryRun([{ method: 'mint' }]);
    expect([randomSource()(), randomSource()()]).toEqual(control);
  });

  it('an opaque source cannot be forked, and the preview advances it', () => {
    let calls = 0;
    setRandomSource(() => {
      calls += 1;
      return (calls % 997) / 997;
    });
    syncEngine.dryRun([{ method: 'mint' }]);
    expect(calls).toBeGreaterThan(0);
  });
});

describe('patch values belong to the patch', () => {
  it("stay stable when the engine works on the caller's own objects", () => {
    // borrowed mode: setState(record, false) hands the engine the caller's object, so the live
    // post-state IS the caller's; a patch value that aliased it would change when the caller did
    const doc: any = { tournamentId: 'B', tournamentName: 'borrowed' };
    syncEngine.setState(doc, false);
    const result: any = syncEngine.dryRun([{ method: 'addObject', params: { key: 'added', name: 'previewed' } }]);
    syncEngine.setState({ tournamentId: 'T', tournamentName: 'original' }, true);

    const added = result.patch.find((op) => op.path === '/B/added');
    expect(added.value).toEqual({ nested: { name: 'previewed' } });
    if (doc.added) doc.added.nested.name = 'changed by the caller';
    expect(added.value).toEqual({ nested: { name: 'previewed' } });
  });
});
