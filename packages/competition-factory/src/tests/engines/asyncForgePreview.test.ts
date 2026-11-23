import { addNotice, getTournamentRecord, setStateProvider, setSubscriptions } from '@Global/state/globalState';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { useQuietCaughtErrors } from '@Tests/testHarness/engineCatch';
import syncGlobalState from '@Global/state/syncGlobalState';
import { setTournamentName } from '@Mutate/tournaments/tournamentDetails';
import { asyncEngine, dryRun, explain, tournamentEngine } from '../../index';
import { afterEach, expect, it, vi } from 'vitest';

import type { AsyncFactoryEngine } from '@Types/asyncEngineTypes';
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
    setSubscriptions({ subscriptions: { previewWrite: delivered } });
    engine.importMethods({
      later: async ({ tournamentRecord }: Write) => {
        entered.resolve();
        await gate.promise;
        expect(getTournamentRecord(id)).toBe(tournamentRecord);
        expect(tournamentRecord.tournamentName).toBe('entry');
        tournamentRecord.tournamentName = 'projected';
        addNotice({ topic: 'previewWrite', payload: { name: 'projected' } });
        return { success: true, name: 'piped' };
      },
      consume: ({ tournamentRecord, name }: Write & { name: string }) => {
        tournamentRecord.notes = name;
        return { success: true, name };
      },
      commit: async ({ tournamentRecord }: Write) => {
        await Promise.resolve();
        expect(getTournamentRecord(id)).toBe(borrowed);
        tournamentRecord.tournamentName = 'committed';
        return { success: true };
      },
    });
    const pending = engine.dryRun([{ method: 'later' }, { method: 'consume', pipe: { name: true } }]);
    try {
      await entered.promise;
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
    expect(result.willEmitNotices).toEqual([{ topic: 'previewWrite', payloads: [{ name: 'projected' }] }]);
    expect(borrowed.tournamentName).toBe('committed');
    expect(borrowed.notes).toBeUndefined();
    expect(delivered).not.toHaveBeenCalled();
  }));

it('keeps overlapping nested explanations in their own request state after await', () =>
  request(async (engine, borrowed) => {
    const entered = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    engine.importMethods({
      inner: async ({ tournamentRecord, label }: Write & { label: string }) => {
        const inherited = tournamentRecord.tournamentName;
        if (label === 'first') {
          entered.resolve();
          await release.promise;
        }
        expect(getTournamentRecord(id)).toBe(tournamentRecord);
        tournamentRecord.tournamentName = label;
        return { success: true, inherited };
      },
      outer: async ({ tournamentRecord }: Write) => {
        await Promise.resolve();
        tournamentRecord.tournamentName = 'outer';
        const first = engine.explain('inner', { label: 'first' });
        await entered.promise;
        try {
          const second = await engine.explain('inner', { label: 'second' });
          expect(second.detail.results[0]).toMatchObject({ inherited: 'outer' });
          expect(second.detail.patch).toEqual([{ op: 'replace', path: '/preview/tournamentName', value: 'second' }]);
        } finally {
          release.resolve();
        }
        const resumed = await first;
        expect(resumed.detail.patch).toEqual([{ op: 'replace', path: '/preview/tournamentName', value: 'first' }]);
        expect(getTournamentRecord(id)).toBe(tournamentRecord);
        expect(tournamentRecord.tournamentName).toBe('outer');
        return { success: true };
      },
    });
    const result = await engine.explain('outer');
    expect(result.wouldSucceed).toBe(true);
    expect(result.touchesPaths).toEqual(['/preview/tournamentName']);
    expect(result.detail.patch).toEqual([{ op: 'replace', path: '/preview/tournamentName', value: 'outer' }]);
    expect(getTournamentRecord(id)).toBe(borrowed);
    expect(borrowed.tournamentName).toBe('entry');
  }));

it.each(['refuse', 'reject', 'dev-reject'] as const)('isolates writes preceding a post-await %s', (kind) =>
  request(async (engine, borrowed) => {
    const failure = new Error('private directive rejected');
    const refusal = { code: 'PRIVATE_REFUSAL', message: 'private directive refused' };
    const next = vi.fn();
    engine.importMethods({
      failing: async ({ tournamentRecord }: Write) => {
        await Promise.resolve();
        tournamentRecord.tournamentName = 'failed preview';
        if (kind === 'refuse') return { error: refusal };
        throw failure;
      },
      next,
    });
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
    engine.importMethods({
      renameLater: async ({ tournamentRecord, name }: Write & { name: string }) => {
        await Promise.resolve();
        tournamentRecord.tournamentName = name;
        return { success: true, name };
      },
    });
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
