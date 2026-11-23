import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { notifySubscribersAsync } from '@Global/state/notifySubscribers';
import { useQuietCaughtErrors } from '@Tests/testHarness/engineCatch';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import syncGlobalState from '@Global/state/syncGlobalState';
import asyncEngine from '@Engines/asyncEngine';
import syncEngine from '@Engines/syncEngine';
import {
  addNotice,
  cycleMutationStatus,
  deleteNotices,
  getNotices,
  setDeepCopy,
  setGlobalSubscriptions,
  setStateProvider,
  setSubscriptions,
} from '@Global/state/globalState';

// constants
import { INVALID_VALUES, METHOD_NOT_FOUND, ROLLBACK_UNAVAILABLE } from '@Constants/errorConditionConstants';

// The engine wrapper's own contract, demonstrated with trivial methods: what a refused, malformed,
// thrown or rolled-back operation leaves behind. Competition logic is deliberately absent; these
// would read the same for any method that writes a record and buffers a notice.

const TOPIC = 'operationIntegrity';
const GLOBAL_TOPIC = 'operationIntegrityGlobal';

let delivered: any[] = [];
let globallyDelivered: any[] = [];

const methods = {
  write: ({ tournamentRecord, name }) => {
    tournamentRecord.tournamentName = name;
    addNotice({ topic: TOPIC, payload: { name } });
    return { success: true };
  },
  refuse: () => ({ error: { message: 'refused', code: 'ERR_REFUSED' } }),
  boom: ({ tournamentRecord }) => {
    tournamentRecord.tournamentName = 'thrown';
    throw new Error('boom');
  },
  read: () => ({ success: true }),
  writeExtra: ({ tournamentRecord, name }) => {
    tournamentRecord.extra.nested.name = name;
    return { success: true };
  },
};
syncEngine.importMethods(methods);
asyncEngine.importMethods(methods);

class StoredDocument {
  tournamentId = 'T';
  tournamentName = 'original';
}

const engines = [
  ['sync', syncEngine],
  ['async', asyncEngine],
] as const;

const records = () => [
  { tournamentId: 'T', tournamentName: 'original', extra: { nested: { name: 'before' } } },
  { tournamentId: 'U', tournamentName: 'other' },
  { tournamentId: 'V', tournamentName: 'third' },
];

const nameOf = (engine, tournamentId = 'T') => engine.getTournament({ tournamentId }).tournamentRecord?.tournamentName;

beforeEach(async () => {
  setStateProvider(syncGlobalState);
  await syncEngine.setState(records());
  await syncEngine.setTournamentId('T');
  deleteNotices();
  cycleMutationStatus();
  delivered = [];
  globallyDelivered = [];
  setSubscriptions({ subscriptions: { [TOPIC]: (payloads) => delivered.push(...payloads) } });
});

afterEach(() => {
  syncEngine.devContext(false);
  setDeepCopy(true, { ignore: [] });
  setSubscriptions({ subscriptions: {} });
  setStateProvider(syncGlobalState);
});

describe('a queue is validated before any directive runs', () => {
  const malformed: [string, any[], any][] = [
    ['an unknown method', [{ method: 'write', params: { name: 'w' } }, { method: 'missing' }], METHOD_NOT_FOUND],
    ['a primitive directive', [{ method: 'write', params: { name: 'w' } }, 42], INVALID_VALUES],
    ['a null directive', [{ method: 'write', params: { name: 'w' } }, null], INVALID_VALUES],
    ['an array directive', [{ method: 'write', params: { name: 'w' } }, []], INVALID_VALUES],
    [
      'primitive params',
      [
        { method: 'write', params: { name: 'w' } },
        { method: 'read', params: 1 },
      ],
      INVALID_VALUES,
    ],
    ['a pipe on the first directive', [{ method: 'write', params: { name: 'w' }, pipe: { x: true } }], INVALID_VALUES],
    [
      'a primitive pipe',
      [
        { method: 'write', params: { name: 'w' } },
        { method: 'read', pipe: 1 },
      ],
      INVALID_VALUES,
    ],
  ];

  for (const [label, engine] of engines) {
    for (const rollbackOnError of [true, false]) {
      it.each(malformed)(
        `${label} queue, rollback ${rollbackOnError}: %s is refused and nothing is written`,
        async (_, directives, error) => {
          let result: any = await engine.executionQueue(directives, rollbackOnError);
          expect(result.error).toEqual(error);
          expect(nameOf(engine)).toEqual('original');

          // nothing buffered, nothing delivered later, and the next call does not stamp a modification
          result = await engine.executionQueue([{ method: 'read' }]);
          expect(result.success).toEqual(true);
          expect(delivered).toEqual([]);
          expect(cycleMutationStatus()).toEqual(false);
        },
      );
    }
  }

  it('a queue that is not an array is refused', async () => {
    for (const [, engine] of engines) {
      const result: any = await engine.executionQueue('not a queue' as any);
      expect(result.error).toEqual(INVALID_VALUES);
    }
  });

  it('a pipe copies only the keys the previous result carries', () => {
    const echo = ({ value }) => ({ success: true, value });
    syncEngine.importMethods({ echo });
    const result: any = syncEngine.executionQueue([
      { method: 'echo', params: { value: 1 } },
      { method: 'echo', params: { value: 2, absent: 3 }, pipe: { value: true, absent: true } },
    ]);
    expect(result.results[1].value).toEqual(1);
  });

  it('null params and a null pipe still read as absent', () => {
    const result: any = syncEngine.executionQueue([
      { method: 'write', params: { name: 'w' } },
      { method: 'read', params: null, pipe: null } as any,
    ]);
    expect(result.success).toEqual(true);
  });
});

describe.each(engines)('%s queue: a refused queue with rollbackOnError restores the whole operation', (_, engine) => {
  it('restores the record and the selection when several records are loaded', async () => {
    const result: any = await engine.executionQueue(
      [{ method: 'write', params: { name: 'refused write' } }, { method: 'refuse' }],
      true,
    );
    expect(result.rolledBack).toEqual(true);
    expect(nameOf(engine)).toEqual('original');
    expect(engine.getTournamentId()).toEqual('T');
  });

  it('delivers nothing for the reverted write, and the next call stamps nothing', async () => {
    await engine.executionQueue([{ method: 'write', params: { name: 'reverted' } }, { method: 'refuse' }], true);
    expect(getNotices({ topic: TOPIC })).toEqual([]);

    const result: any = await engine.executionQueue([{ method: 'read' }]);
    expect(result.success).toEqual(true);
    expect(delivered).toEqual([]);
    expect(cycleMutationStatus()).toEqual(false);
  });

  it('keeps the notices an enclosing operation buffered before it', async () => {
    let result: any = await engine.write({ name: 'delayed', delayNotify: true });
    expect(result.success).toEqual(true);
    expect(getNotices({ topic: TOPIC })).toEqual([{ name: 'delayed' }]);

    result = await engine.executionQueue(
      [{ method: 'write', params: { name: 'reverted' } }, { method: 'refuse' }],
      true,
    );
    expect(result.rolledBack).toEqual(true);
    expect(getNotices({ topic: TOPIC })).toEqual([{ name: 'delayed' }]);

    await engine.executionQueue([{ method: 'read' }]);
    expect(delivered).toEqual([{ name: 'delayed' }]);
  });

  it('restores before rethrowing a method that throws under devContext', async () => {
    engine.devContext(true);
    await expect(async () =>
      engine.executionQueue([{ method: 'write', params: { name: 'w' } }, { method: 'boom' }], true),
    ).rejects.toThrow('boom');
    engine.devContext(false);
    expect(nameOf(engine)).toEqual('original');
    expect(engine.getTournamentId()).toEqual('T');
    expect(getNotices({ topic: TOPIC })).toEqual([]);
  });

  it('refuses BEFORE any directive runs when the snapshot could not be restored', async () => {
    // the engine works on the caller's object (deep copy off), and that object is a class instance
    // (as a database document is): the factory cannot copy it, and no provider hook restores it
    const doc = new StoredDocument();
    await engine.setState(doc, false);
    let result: any = await engine.executionQueue(
      [{ method: 'write', params: { name: 'never written' } }, { method: 'refuse' }],
      true,
    );
    expect(result.error).toEqual(ROLLBACK_UNAVAILABLE);
    expect(result.rolledBack).toEqual(false);

    result = await engine.execute({ write: methods.write, name: 'never written', rollbackOnError: true });
    expect(result.error).toEqual(ROLLBACK_UNAVAILABLE);

    expect(doc.tournamentName).toEqual('original');
    expect(getNotices({ topic: TOPIC })).toEqual([]);
  });

  it('copies a subtree listed in `ignore`, so a rollback restores it rather than dropping it', async () => {
    setDeepCopy(true, { ignore: ['extra', 'tournamentId'] });
    const result: any = await engine.executionQueue(
      [{ method: 'writeExtra', params: { name: 'refused' } }, { method: 'refuse' }],
      true,
    );
    setDeepCopy(true, { ignore: [] });
    expect(result.rolledBack).toEqual(true);
    const record = engine.getTournament({ tournamentId: 'T' }).tournamentRecord;
    expect(record.extra).toEqual({ nested: { name: 'before' } });
    expect(record.tournamentId).toEqual('T');
  });

  it('without rollbackOnError, reports rolledBack: false and keeps the write', async () => {
    const result: any = await engine.executionQueue([
      { method: 'write', params: { name: 'kept' } },
      { method: 'refuse' },
    ]);
    expect(result.rolledBack).toEqual(false);
    expect(nameOf(engine)).toEqual('kept');
  });
});

describe.each(engines)('%s invoke: a refused call with rollbackOnError restores the whole operation', (_, engine) => {
  it('restores the record, delivers nothing, and stamps nothing', async () => {
    const refuseAfterWrite = ({ tournamentRecord }) => {
      methods.write({ tournamentRecord, name: 'reverted' });
      return methods.refuse();
    };
    let result: any = await engine.execute({ refuseAfterWrite, rollbackOnError: true });
    expect(result.error.code).toEqual('ERR_REFUSED');
    expect(nameOf(engine)).toEqual('original');
    expect(engine.getTournamentId()).toEqual('T');
    expect(getNotices({ topic: TOPIC })).toEqual([]);

    result = await engine.read();
    expect(result.success).toEqual(true);
    expect(delivered).toEqual([]);
    expect(cycleMutationStatus()).toEqual(false);
  });

  it('restores before rethrowing under devContext', async () => {
    engine.devContext(true);
    await expect(async () => engine.execute({ boom: methods.boom, rollbackOnError: true })).rejects.toThrow('boom');
    engine.devContext(false);
    expect(nameOf(engine)).toEqual('original');
  });
});

describe('global subscriptions', () => {
  it('a global-only subscription is delivered, once', () => {
    setSubscriptions({ subscriptions: {} });
    setGlobalSubscriptions({ subscriptions: { [GLOBAL_TOPIC]: (payloads) => globallyDelivered.push(...payloads) } });
    const writeGlobal = () => {
      addNotice({ topic: GLOBAL_TOPIC, payload: { id: 1 } });
      return { success: true };
    };
    const result: any = syncEngine.execute({ writeGlobal });
    expect(result.success).toEqual(true);
    expect(globallyDelivered).toEqual([{ id: 1 }]);
    setGlobalSubscriptions({ subscriptions: { [GLOBAL_TOPIC]: undefined } });
  });

  it('a topic with both a local and a global subscription reaches each callback once', () => {
    setSubscriptions({ subscriptions: { [GLOBAL_TOPIC]: (payloads) => delivered.push(...payloads) } });
    setGlobalSubscriptions({ subscriptions: { [GLOBAL_TOPIC]: (payloads) => globallyDelivered.push(...payloads) } });
    const writeBoth = () => {
      addNotice({ topic: GLOBAL_TOPIC, payload: { id: 2 } });
      return { success: true };
    };
    syncEngine.execute({ writeBoth });
    expect(delivered).toEqual([{ id: 2 }]);
    expect(globallyDelivered).toEqual([{ id: 2 }]);
    setGlobalSubscriptions({ subscriptions: { [GLOBAL_TOPIC]: undefined } });
  });
});

describe('state provider installation', () => {
  it('refuses null with the documented error, not an incidental TypeError', () => {
    expect(() => setStateProvider(null as any)).toThrow('Global state provider can not be undefined or null');
  });

  it('still installs a provider that stubs a required method it never calls', () => {
    // presence is the contract; callability was never checked, and checking it would refuse
    // providers that work today
    expect(setStateProvider({ ...syncGlobalState, removeTournamentRecord: undefined } as any).success).toEqual(true);
  });

  it('the async reference provider restores its own notice buffer on rollback', async () => {
    setStateProvider(asyncGlobalState);
    await asyncGlobalState.runWithInstanceState(async () => {
      // the method registry is per context too
      asyncEngine.importMethods(methods);
      await asyncEngine.setState(records());
      await asyncEngine.setTournamentId('T');
      setSubscriptions({ subscriptions: { [TOPIC]: (payloads) => delivered.push(...payloads) } });

      await asyncEngine.write({ name: 'delayed', delayNotify: true });
      const result: any = await asyncEngine.executionQueue(
        [{ method: 'write', params: { name: 'reverted' } }, { method: 'refuse' }],
        true,
      );
      expect(result.rolledBack).toEqual(true);
      expect(nameOf(asyncEngine)).toEqual('delayed');
      expect(getNotices({ topic: TOPIC })).toEqual([{ name: 'delayed' }]);
    });
  });
});

describe('dispatch', () => {
  useQuietCaughtErrors(); // the thrower is caught on purpose; its ERROR line is expected
  it('the async dispatch does not deliver an empty payload list', async () => {
    deleteNotices();
    await notifySubscribersAsync();
    expect(delivered).toEqual([]);
  });

  it('an imported method that throws returns the caught-error envelope', () => {
    syncEngine.importMethods({
      thrower: () => {
        throw new Error('caught');
      },
    });
    const result: any = syncEngine.thrower();
    expect(result.error).toBeDefined();
  });
});
