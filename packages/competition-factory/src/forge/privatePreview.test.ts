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
    const engine = asyncEngine(true);
    setStateProvider(asyncGlobalState);
    async function request(id: string) {
      return asyncGlobalState.runWithInstanceState(async () => {
        const doc = { tournamentId: id, tournamentName: id, notes: 'loaded' };
        await engine.setState(doc, false);
        setSubscriptions({
          subscriptions: {
            preview: () => {
              throw new Error('preview delivered');
            },
          },
        });
        const observeParent = AsyncResource.bind(() => {
          expect(getTournamentRecord(id)).toBe(doc);
          expect(doc.tournamentName).toBe(id);
          doc.notes = 'committed independently';
        });
        let descendant: Promise<void> | undefined;
        function write({ tournamentRecord, entity }) {
          expect(tournamentRecord).not.toBe(doc);
          expect(entity).toBe(tournamentRecord);
          entity.tournamentName = 'preview-' + id;
          addNotice({ topic: 'preview', payload: { id } });
          observeParent();
          descendant = Promise.resolve().then(() => {
            expect(getTournamentRecord(id)).toBe(entity);
            entity.notes = 'child only';
          });
          return { success: true };
        }
        engine.importMethods({ write });
        markModified(id);
        await Promise.resolve();
        const params = { entity: doc };
        const result =
          kind === 'dryRun' ? engine.dryRun([{ method: 'write', params }]) : engine.explain('write', params).detail;
        expect(result.wouldSucceed).toBe(true);
        expect(result.patch).toEqual([{ op: 'replace', path: '/' + id + '/tournamentName', value: 'preview-' + id }]);
        expect(result.willEmitNotices).toEqual([{ topic: 'preview', payloads: [{ id }] }]);
        await descendant;
        expect(doc).toEqual({ tournamentId: id, tournamentName: id, notes: 'committed independently' });
        expect(getTournamentRecord(id)).toBe(doc);
        expect(cycleMutationStatus()).toBe(true);
      });
    }
    await Promise.all([request('first'), request('second')]);
  },
);

it('keeps a real subscriber out of nested dispatch inside a preview', async () => {
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
      expect(engine.dryRun([{ method: 'nestedNotify' }]).wouldSucceed).toBe(true);
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
  engine.importMethods({
    later: async () => {
      called = true;
    },
  });
  expect(engine.dryRun([{ method: 'later' }]).error).toEqual(MISSING_ASYNC_STATE_PROVIDER);
  expect(called).toBe(false);
});
