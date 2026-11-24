import { getTournamentRecord, setStateProvider, setSubscriptions } from '@Global/state/globalState';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { useQuietCaughtErrors } from '@Tests/testHarness/engineCatch';
import syncGlobalState from '@Global/state/syncGlobalState';
import { setTournamentName } from '@Mutate/tournaments/tournamentDetails';
import { asyncEngine, dryRun, explain, registerPreviewMethod, tournamentEngine } from '../../index';
import { afterEach, expect, it, vi } from 'vitest';

import type { AsyncFactoryEngine } from '@Assemblies/engines/types/asyncEngineTypes';
import type { Tournament } from '@Types/tournamentTypes';

type Write = { tournamentRecord: Tournament };
const id = 'preview';
useQuietCaughtErrors();
afterEach(() => setStateProvider(syncGlobalState));

function request(run: (engine: AsyncFactoryEngine, borrowed: Tournament) => Promise<void>) {
  setStateProvider(asyncGlobalState);
  return asyncGlobalState.runWithInstanceState(async () => {
    const engine = asyncEngine(true);
    const borrowed = { tournamentId: id, tournamentName: 'entry' };
    engine.setState(borrowed, false);
    try {
      await run(engine, borrowed);
    } finally {
      engine.devContext(false);
    }
  });
}

it('awaits a private directive before piping its result, while the caller can commit', () =>
  request(async (engine, borrowed) => {
    const gate = Promise.withResolvers<void>();
    const entered = Promise.withResolvers<void>();
    const delivered = vi.fn();
    setSubscriptions({ subscriptions: { modifyTournamentDetail: delivered } });
    const later = vi.fn(() => ({ success: true }));
    const consume = ({ tournamentRecord, name }: Write & { name: string }) => {
      tournamentRecord.notes = name;
      return { success: true, name };
    };
    engine.importMethods({
      setTournamentName,
      later,
      consume,
      commit: async ({ tournamentRecord }: Write) => {
        await Promise.resolve();
        expect(getTournamentRecord(id)).toBe(borrowed);
        tournamentRecord.tournamentName = 'committed';
        return { success: true };
      },
    });
    registerPreviewMethod(engine, consume, consume);
    registerPreviewMethod(engine, later, async ({ tournamentRecord }: Write, receiver) => {
      entered.resolve();
      await gate.promise;
      expect(tournamentRecord).not.toBe(borrowed);
      expect(tournamentRecord.tournamentName).toBe('entry');
      const nested = await receiver.executionQueue([
        { method: 'setTournamentName', params: { tournamentName: 'projected' } },
      ]);
      expect(nested).toMatchObject({ success: true });
      return { success: true, name: 'piped' };
    });
    const pending = engine.dryRun([{ method: 'later' }, { method: 'consume', pipe: { name: true } }]);
    try {
      await Promise.race([
        entered.promise,
        Promise.resolve(pending).then(() => {
          throw new Error('private directive never entered');
        }),
      ]);
      expect((await engine.executionQueue([{ method: 'commit' }])).success).toBe(true);
      expect(getTournamentRecord(id)).toBe(borrowed);
    } finally {
      gate.resolve();
    }
    const result = await pending;
    expect(result.results).toMatchObject([
      { methodName: 'later', name: 'piped' },
      { methodName: 'consume', name: 'piped' },
    ]);
    expect(result.wouldSucceed).toBe(true);
    expect(result.patch).toEqual(
      expect.arrayContaining([
        { op: 'replace', path: '/preview/tournamentName', value: 'projected' },
        { op: 'add', path: '/preview/notes', value: 'piped' },
      ]),
    );
    expect(result.willEmitNotices).toMatchObject([
      { topic: 'modifyTournamentDetail', payloads: [{ tournamentId: id, tournamentName: 'projected' }] },
    ]);
    expect(later).not.toHaveBeenCalled();
    expect(borrowed.tournamentName).toBe('committed');
    expect(borrowed.notes).toBeUndefined();
    expect(delivered).not.toHaveBeenCalled();
  }));

it('keeps two overlapping explanations independent when a private implementation resumes', () =>
  request(async (engine, borrowed) => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    const rename = vi.fn(() => ({ success: true }));
    engine.importMethods({ rename });
    registerPreviewMethod(engine, rename, async ({ tournamentRecord, label }: Write & { label: string }) => {
      const inherited = tournamentRecord.tournamentName;
      if (label === 'first') {
        entered.resolve();
        await release.promise;
      }
      expect(tournamentRecord.tournamentName).toBe('entry');
      tournamentRecord.tournamentName = label;
      return { success: true, inherited };
    });
    const first = engine.explain('rename', { label: 'first' });
    try {
      await Promise.race([
        entered.promise,
        Promise.resolve(first).then(() => {
          throw new Error('first directive never entered');
        }),
      ]);
      const second = await engine.explain('rename', { label: 'second' });
      expect(second.detail.results[0]).toMatchObject({ inherited: 'entry' });
      expect(second.detail.patch).toEqual([{ op: 'replace', path: '/preview/tournamentName', value: 'second' }]);
    } finally {
      release.resolve();
    }
    const resumed = await first;
    expect(resumed.detail.results[0]).toMatchObject({ inherited: 'entry' });
    expect(resumed.detail.patch).toEqual([{ op: 'replace', path: '/preview/tournamentName', value: 'first' }]);
    expect(getTournamentRecord(id)).toBe(borrowed);
    expect(borrowed.tournamentName).toBe('entry');
    expect(rename).not.toHaveBeenCalled();
  }));

it.each(['refuse', 'reject', 'dev-reject'] as const)('isolates writes preceding a post-await %s', (kind) =>
  request(async (engine, borrowed) => {
    const failure = new Error('private directive rejected');
    const refusal = { code: 'PRIVATE_REFUSAL', message: 'private directive refused' };
    const next = vi.fn();
    const methods = {
      failing: async ({ tournamentRecord }: Write) => {
        await Promise.resolve();
        tournamentRecord.tournamentName = 'failed preview';
        if (kind === 'refuse') return { error: refusal };
        throw failure;
      },
      next,
    };
    engine.importMethods(methods);
    registerPreviewMethod(engine, methods.failing, methods.failing);
    registerPreviewMethod(engine, next, next);
    engine.devContext(kind === 'dev-reject');
    const result = engine.dryRun([{ method: 'failing' }, { method: 'next' }]);
    if (kind === 'dev-reject') {
      await expect(result).rejects.toBe(failure);
    } else {
      expect(await result).toMatchObject({
        wouldSucceed: false,
        rolledBack: true,
        error: kind === 'refuse' ? refusal : failure.message,
      });
    }
    expect(next).not.toHaveBeenCalled();
    expect(getTournamentRecord(id)).toBe(borrowed);
    expect(borrowed.tournamentName).toBe('entry');
  }),
);

it('awaits a Promise-returning directive through both standalone package exports', () =>
  request(async (engine, borrowed) => {
    const methods = {
      renameLater: async ({ tournamentRecord, name }: Write & { name: string }) => {
        await Promise.resolve();
        tournamentRecord.tournamentName = name;
        return { success: true, name };
      },
    };
    engine.importMethods(methods);
    registerPreviewMethod(engine, methods.renameLater, methods.renameLater);
    const pendingDry = dryRun(engine, [{ method: 'renameLater', params: { name: 'dry' } }]);
    const pendingExplanation = explain(engine, 'renameLater', { name: 'explain' });
    expect(pendingDry).toBeInstanceOf(Promise);
    expect(pendingExplanation).toBeInstanceOf(Promise);
    const [run, explanation] = await Promise.all([pendingDry, pendingExplanation]);
    expect(run.results).toEqual([{ success: true, name: 'dry', methodName: 'renameLater' }]);
    expect(run.patch).toEqual([{ op: 'replace', path: '/preview/tournamentName', value: 'dry' }]);
    expect(explanation.detail.results).toEqual([{ success: true, name: 'explain', methodName: 'renameLater' }]);
    expect(explanation.touchesPaths).toEqual(['/preview/tournamentName']);
    expect(explanation.detail.patch).toEqual([{ op: 'replace', path: '/preview/tournamentName', value: 'explain' }]);
    expect(getTournamentRecord(id)).toBe(borrowed);
    expect(borrowed.tournamentName).toBe('entry');
  }));

it('returns immediately for a synchronous built-in through the instance and standalone exports', () =>
  request(async (engine, borrowed) => {
    engine.importMethods({ setTournamentName });
    const method = 'setTournamentName';
    const params = { tournamentName: 'projected' };
    const queue = [{ method, params }];
    const projected = [{ op: 'replace', path: '/preview/tournamentName', value: 'projected' }];
    for (const result of [engine.dryRun(queue), dryRun(engine, queue)]) {
      expect(result).not.toBeInstanceOf(Promise);
      expect(result).toMatchObject({ wouldSucceed: true, patch: projected });
    }
    for (const result of [engine.explain(method, params), explain(engine, method, params)]) {
      expect(result).not.toBeInstanceOf(Promise);
      expect(result).toMatchObject({ wouldSucceed: true, touchesPaths: ['/preview/tournamentName'] });
    }
    // The synchronous public overload also supports immediate property access in TypeScript.
    expect(dryRun(tournamentEngine, queue).patch).toEqual(projected);
    expect(explain(tournamentEngine, method, params).detail.patch).toEqual(projected);
    expect(borrowed.tournamentName).toBe('entry');
  }));
