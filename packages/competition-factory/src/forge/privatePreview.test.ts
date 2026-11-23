import { registerPreviewMethod } from './previewMethods';
import { setTournamentName } from '@Mutate/tournaments/tournamentDetails';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { generatePatch } from '@Tools/jsonPatch';
import { setClock } from '@Tools/clock';
import { MISSING_ASYNC_STATE_PROVIDER, ROLLBACK_UNAVAILABLE } from '@Constants/errorConditionConstants';
import syncEngine from '@Engines/syncEngine';
import { AsyncResource } from 'node:async_hooks';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { notifySubscribers } from '@Global/state/notifySubscribers';
import syncGlobalState from '@Global/state/syncGlobalState';
import { afterEach, expect, it } from 'vitest';
import { asyncEngine } from '@Assemblies/engines/async';
import {
  addNotice,
  cycleMutationStatus,
  getTournamentRecord,
  getTournamentRecords,
  setTournamentRecords,
  markModified,
  setDeepCopy,
  setGlobalSubscriptions,
  setStateProvider,
  setSubscriptions,
} from '@Global/state/globalState';

afterEach(() => {
  setStateProvider(syncGlobalState);
  setDeepCopy(true, {});
  setClock();
});

it.each(['dryRun', 'explain'] as const)(
  '%s isolates borrowed records during dispatch and in async descendants',
  async (kind) => {
    const at = new Date('2026-11-23T00:00:00Z');
    setClock(() => at);
    setStateProvider(asyncGlobalState);
    async function request(id: string) {
      return asyncGlobalState.runWithInstanceState(async () => {
        const engine = asyncEngine(true);
        const doc = { tournamentId: id, tournamentName: id, notes: 'loaded' };
        const before = structuredClone(doc);
        await engine.setState(doc, false);
        const delivered: unknown[] = [];
        setSubscriptions({ subscriptions: { [MODIFY_TOURNAMENT_DETAIL]: (payloads) => delivered.push(...payloads) } });
        const observeParent = AsyncResource.bind(() => {
          expect(getTournamentRecord(id)).toBe(doc);
          expect(doc.tournamentName).toBe(id);
          doc.notes = 'committed independently';
        });
        let descendant: Promise<void> | undefined;
        const write = () => {
          throw new Error('ordinary closure dispatched');
        };
        engine.importMethods({ write, setTournamentName });
        registerPreviewMethod(
          engine,
          write,
          ({ tournamentRecord, entity }: { tournamentRecord: typeof doc; entity: typeof doc }, receiver) => {
            expect(tournamentRecord).not.toBe(doc);
            expect(entity).toBe(tournamentRecord);
            const nested = receiver.executionQueue([
              { method: 'setTournamentName', params: { tournamentName: 'preview-' + id } },
            ]);
            expect(nested).toMatchObject({ success: true });
            observeParent();
            descendant = Promise.resolve().then(() => {
              entity.notes = 'child only';
              expect(() => receiver.getState()).toThrow('outside its call');
            });
            return { success: true };
          },
        );
        markModified(id);
        await Promise.resolve();
        const params = { entity: doc };
        const result =
          kind === 'dryRun' ? engine.dryRun([{ method: 'write', params }]) : engine.explain('write', params).detail;
        expect(result.wouldSucceed).toBe(true);
        expect(result.willEmitNotices).toMatchObject([
          { topic: MODIFY_TOURNAMENT_DETAIL, payloads: [{ tournamentId: id, tournamentName: 'preview-' + id }] },
        ]);
        await descendant;
        expect(doc).toEqual({ tournamentId: id, tournamentName: id, notes: 'committed independently' });
        expect(getTournamentRecord(id)).toBe(doc);
        expect(cycleMutationStatus()).toBe(true);
        const actual = structuredClone(before);
        engine.setState(actual, false);
        expect(delivered).toEqual([]);
        expect(
          await engine.executionQueue([{ method: 'setTournamentName', params: { tournamentName: 'preview-' + id } }]),
        ).toMatchObject({ success: true });
        expect(actual).toMatchObject({
          tournamentName: 'preview-' + id,
          factory: { timeStamp: at.getTime(), version: engine.version() },
        });
        expect(delivered).toMatchObject([{ tournamentId: id, tournamentName: 'preview-' + id }]);
        expect(result.patch).toEqual(generatePatch({ [id]: before }, { [id]: actual }));
      });
    }
    await Promise.all([request('first'), request('second')]);
  },
);

it('refuses an unregistered closure that would notify a real subscriber', async () => {
  const engine = asyncEngine(true);
  const delivered: any[] = [];
  setStateProvider(asyncGlobalState);
  await asyncGlobalState.runWithInstanceState(async () => {
    await engine.setState({ tournamentId: 'nested' });
    setGlobalSubscriptions({ subscriptions: { nestedPreview: (values) => delivered.push(...values) } });
    try {
      engine.importMethods({
        nestedNotify: () => {
          addNotice({ topic: 'nestedPreview', payload: { id: 'nested' } });
          notifySubscribers();
          return { success: true };
        },
      });
      expect(await engine.dryRun([{ method: 'nestedNotify' }])).toMatchObject({
        error: { code: 'ERR_UNREGISTERED_PREVIEW_METHOD' },
        results: [],
      });
      expect(delivered).toEqual([]);
    } finally {
      setGlobalSubscriptions({ subscriptions: { nestedPreview: undefined } });
    }
  });
});

it('refuses when the provider cannot isolate its preview and keeps the caller untouched', () => {
  const doc = { tournamentId: 'scope', tournamentName: 'original' };
  setStateProvider({ ...syncGlobalState, runWithInstanceState: undefined });
  syncEngine.setState(doc, false);
  const run = syncEngine.dryRun([{ method: 'setTournamentName', params: { tournamentName: 'changed' } }]);
  expect(run.error).toEqual(ROLLBACK_UNAVAILABLE);
  expect(getTournamentRecord('scope')).toBe(doc);
  expect(doc.tournamentName).toBe('original');
});

it('samples the clock in the caller before directive validation', () => {
  setStateProvider(syncGlobalState);
  const doc = { tournamentId: 'clock' };
  syncEngine.setState(doc, false);
  let observed: unknown;
  setClock(() => {
    observed = getTournamentRecord('clock');
    throw new Error('clock unavailable');
  });
  const result = syncEngine.dryRun([{ method: 'unregistered' }]);
  expect(result.error).toMatchObject({
    code: 'ERR_INVALID_DATE',
    message: expect.stringContaining('clock unavailable'),
  });
  expect(observed).toBe(doc);
});

it('requires an async scope before invoking a directive on the async engine', () => {
  setStateProvider(syncGlobalState);
  const engine = asyncEngine(true);
  let called = false;
  const later = async () => {
    called = true;
    return { success: true };
  };
  engine.importMethods({ later });
  registerPreviewMethod(engine, later, later);
  expect(engine.dryRun([{ method: 'later' }]).error).toEqual(MISSING_ASYNC_STATE_PROVIDER);
  expect(called).toBe(false);
});

it('detaches aliased collection members, sparse fields and provider metadata in a borrowed record', () => {
  setStateProvider(syncGlobalState);
  const tag = Symbol('tag');
  const entity = { value: 1 };
  const stamp = new Date('2026-11-23T12:00:00Z');
  const members = new Set([stamp]);
  const sparse = new Array(3);
  sparse[2] = undefined;
  const metadata = Object.assign(Object.create(null), { [tag]: entity, sparse });
  Object.defineProperty(metadata, '__proto__', { value: entity, enumerable: true });
  const record = { tournamentId: 'graph', entity, stamp, members, map: new Map([[entity, members]]), metadata };
  syncEngine.setState(record, false);
  const methods = {
    editGraph: ({ tournamentRecord: child }) => {
      expect(child.map.get(child.entity)).toBe(child.members);
      expect(child.members.has(child.stamp)).toBe(true);
      expect(child.metadata[tag]).toBe(child.entity);
      expect(child.metadata.__proto__).toBe(child.entity);
      expect(Object.getPrototypeOf(child.metadata)).toBe(null);
      expect(0 in child.metadata.sparse).toBe(false);
      expect(Object.hasOwn(child.metadata.sparse, 2)).toBe(true);
      child.members.clear();
      child.map.delete(child.entity);
      child.stamp.setUTCFullYear(2030);
      child.entity.value = 2;
      return { success: true };
    },
  };
  syncEngine.importMethods(methods);
  registerPreviewMethod(syncEngine, methods.editGraph, methods.editGraph);
  const result = syncEngine.dryRun([{ method: 'editGraph' }]);
  expect(result.wouldSucceed).toBe(true);
  expect(entity.value).toBe(1);
  expect(record.map.get(entity)).toBe(members);
  expect(members.has(stamp)).toBe(true);
  expect(stamp.getUTCFullYear()).toBe(2026);
});

it.each([
  ['function', () => undefined],
  ['shared bytes', new Uint8Array(new SharedArrayBuffer(4))],
  ['opaque weak references', new WeakMap()],
])('refuses a borrowed %s field before dispatch', (_, field) => {
  setStateProvider(syncGlobalState);
  syncEngine.setState({ tournamentId: 'unavailable', field }, false);
  let calls = 0;
  const methods = {
    attempt: () => {
      calls++;
      return { success: true };
    },
  };
  syncEngine.importMethods(methods);
  registerPreviewMethod(syncEngine, methods.attempt, methods.attempt);
  expect(syncEngine.dryRun([{ method: 'attempt' }]).error).toEqual(ROLLBACK_UNAVAILABLE);
  expect(calls).toBe(0);
});

it('prevents a custom closure from replacing the borrowed record map during preview', () => {
  const shared = { value: 'entry' };
  const live = { tournamentId: 'rollback', left: shared, right: shared };
  syncEngine.setState(live, false);
  const map = getTournamentRecords();
  let calls = 0;
  syncEngine.importMethods({
    replaceFromClosure() {
      calls++;
      getTournamentRecord('rollback').left.value = 'dirty';
      setTournamentRecords({});
      return { error: 'TEST_REFUSAL' };
    },
  });
  const result = syncEngine.dryRun([{ method: 'replaceFromClosure' }]);
  expect(result).toMatchObject({
    wouldSucceed: false,
    error: { code: 'ERR_UNREGISTERED_PREVIEW_METHOD' },
    results: [],
  });
  expect(calls).toBe(0);
  expect(getTournamentRecords()).toBe(map);
  expect(getTournamentRecord('rollback')).toBe(live);
  expect(live.left).toBe(shared);
  expect(live.right).toBe(shared);
  expect(shared.value).toBe('entry');
});
