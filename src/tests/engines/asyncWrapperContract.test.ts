import { addNotice, setDevContext, setStateProvider, setSubscriptions } from '@Global/state/globalState';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { useQuietCaughtErrors } from '@Tests/testHarness/engineCatch';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import syncGlobalState from '@Global/state/syncGlobalState';
import * as governors from '@Assemblies/governors';
import asyncEngine from '@Engines/asyncEngine';

// constants
import { METHOD_NOT_FOUND } from '@Constants/errorConditionConstants';

/**
 * WHAT ANY ASYNC WRAPPER MUST GUARANTEE (CA, 2026-10-10: "demonstrate ways in which async wrappers are valid rather than
 * checking actual methods"). competition-factory-server is the real implementation; this is the checklist it, or any
 * other embedder, can mirror. Each request runs in its own `runWithInstanceState` context, and while requests
 * interleave on awaits:
 *
 *   1. each context sees only its own records and selection;
 *   2. `rollbackOnError` restores only the context that failed;
 *   3. notices reach only the subscriptions of the context that produced them;
 *   4. a thrown method or an unknown method leaves every other context untouched;
 *   5. a throw is a refusal: an error result, rolled back under rollbackOnError, nothing notified. That holds for an
 *      async method (whose rejection arrives after the engine's try/catch has returned) and for a state provider whose
 *      `handleCaughtError` returns nothing (the reference async provider did: a throw read as `{}`).
 *
 * The methods are deliberately trivial stand-ins (rename a tournament, yield, refuse, throw). Competition logic is
 * covered by the sync suite; running it again through this wrapper would re-test scoring, not the wrapper.
 * Concurrency on the SAME tournament is out of scope: that is the embedder's per-tournament lock (CFS's mutex).
 */

const TOPIC = 'asyncWrapperContract';

const tick = (ms = 2) => new Promise((resolve) => setTimeout(resolve, ms));

// awaits BEFORE and AFTER its write, so a sibling context runs in between both times
const methods = {
  slowRename: async ({ tournamentRecord, name }) => {
    await tick();
    tournamentRecord.tournamentName = name;
    addNotice({ topic: TOPIC, payload: { name } });
    await tick();
    return { success: true };
  },
  refuse: async () => {
    await tick();
    return { error: { message: 'refused', code: 'ERR_REFUSED' } };
  },
  boom: async ({ tournamentRecord }) => {
    await tick();
    tournamentRecord.tournamentName = 'thrown';
    throw new Error('boom');
  },
  syncBoom: ({ tournamentRecord }) => {
    tournamentRecord.tournamentName = 'thrown';
    throw new Error('syncBoom');
  },
};

const record = (tournamentId: string) => ({ tournamentId, tournamentName: `${tournamentId}-original` });

/** One request: a fresh context with its own methods, record and subscription, as an embedder would set it up. */
const request = <T>(tournamentId: string, body: (delivered: any[]) => Promise<T>) =>
  asyncGlobalState.runWithInstanceState(async () => {
    const delivered: any[] = [];
    asyncEngine.importMethods(methods);
    asyncEngine.importMethods(governors, true, 1);
    await asyncEngine.setState([record(tournamentId)]);
    await asyncEngine.setTournamentId(tournamentId);
    setSubscriptions({ subscriptions: { [TOPIC]: (payloads) => delivered.push(...payloads) } });
    await tick();
    return body(delivered);
  });

const tournamentIds = async () => Object.keys((await asyncEngine.getState()).tournamentRecords ?? {});
const nameOf = async (tournamentId: string) =>
  (await asyncEngine.getTournament({ tournamentId })).tournamentRecord?.tournamentName;

describe('async wrapper contract', () => {
  useQuietCaughtErrors(); // contracts 4 and 5 throw on purpose; the provider's ERROR line is expected
  beforeAll(() => {
    setStateProvider(asyncGlobalState);
  });
  afterAll(() => {
    setStateProvider(syncGlobalState);
  });

  it('1. each of N interleaved contexts sees only its own records, selection and writes', async () => {
    const ids = ['A', 'B', 'C', 'D', 'E', 'F'];
    const results = await Promise.all(
      ids.map((id) =>
        request(id, async () => {
          const result: any = await asyncEngine.slowRename({ name: `${id}-renamed` });
          expect(result.success).toEqual(true);
          // a real engine method, through the same wrapper
          const renamed: any = await asyncEngine.setTournamentName({ tournamentName: `${id}-final` });
          expect(renamed.success).toEqual(true);
          await tick();
          return { ids: await tournamentIds(), name: await nameOf(id) };
        }),
      ),
    );

    results.forEach((result, index) => {
      expect(result.ids).toEqual([ids[index]]);
      expect(result.name).toEqual(`${ids[index]}-final`);
    });
  });

  it('2. rollbackOnError restores only the context whose queue failed', async () => {
    const [failed, succeeded] = await Promise.all([
      request('A', async () => {
        const result: any = await asyncEngine.executionQueue(
          [{ method: 'slowRename', params: { name: 'A-reverted' } }, { method: 'refuse' }],
          true,
        );
        expect(result.error).toBeDefined();
        expect(result.rolledBack).toEqual(true);
        return nameOf('A');
      }),
      // writes while A's queue is between its two directives
      request('B', async () => {
        const result: any = await asyncEngine.executionQueue([
          { method: 'slowRename', params: { name: 'B-kept' } },
          { method: 'slowRename', params: { name: 'B-kept-twice' } },
        ]);
        expect(result.success).toEqual(true);
        return nameOf('B');
      }),
    ]);

    expect(failed).toEqual('A-original');
    expect(succeeded).toEqual('B-kept-twice');
  });

  it('3. notices reach only the subscriptions of the context that produced them', async () => {
    const delivered = await Promise.all(
      ['A', 'B', 'C'].map((id) =>
        request(id, async (collected) => {
          await asyncEngine.slowRename({ name: `${id}-1` });
          await asyncEngine.slowRename({ name: `${id}-2` });
          return collected.map((payload) => payload.name);
        }),
      ),
    );

    expect(delivered).toEqual([
      ['A-1', 'A-2'],
      ['B-1', 'B-2'],
      ['C-1', 'C-2'],
    ]);
  });

  it('3b. a refused call delivers nothing, in its own context or any other', async () => {
    const [refused, neighbour] = await Promise.all([
      request('A', async (collected) => {
        const result: any = await asyncEngine.executionQueue(
          [{ method: 'slowRename', params: { name: 'A-never-announced' } }, { method: 'refuse' }],
          true,
        );
        expect(result.rolledBack).toEqual(true);
        return collected;
      }),
      request('B', async (collected) => {
        await asyncEngine.slowRename({ name: 'B-announced' });
        return collected.map((payload) => payload.name);
      }),
    ]);

    expect(refused).toEqual([]);
    expect(neighbour).toEqual(['B-announced']);
  });

  it('4. a thrown method or an unknown method leaves every other context untouched', async () => {
    const [broken, neighbour] = await Promise.all([
      request('A', async () => {
        const thrown: any = await asyncEngine.boom();
        expect(thrown.error).toBeDefined();
        const missing: any = await asyncEngine.execute({ method: 'noSuchMethod', params: {} });
        expect(missing.error).toEqual(METHOD_NOT_FOUND);
        return { ids: await tournamentIds() };
      }),
      request('B', async (collected) => {
        await asyncEngine.slowRename({ name: 'B-1' });
        await tick();
        await asyncEngine.slowRename({ name: 'B-2' });
        return { ids: await tournamentIds(), name: await nameOf('B'), delivered: collected.map((p) => p.name) };
      }),
    ]);

    expect(broken.ids).toEqual(['A']);
    expect(neighbour).toEqual({ ids: ['B'], name: 'B-2', delivered: ['B-1', 'B-2'] });
  });

  describe('5. a throw is a refusal', () => {
    const throwers = [
      ['an async method that rejects', 'boom'],
      ['a sync method that throws', 'syncBoom'],
    ] as const;

    it.each(throwers)(
      '%s: the queue refuses with an error, rolls back and notifies nothing',
      async (_label, method) => {
        const outcome = await request('A', async (collected) => {
          const result: any = await asyncEngine.executionQueue(
            [{ method: 'slowRename', params: { name: 'A-before-throw' } }, { method }],
            true,
          );
          return { result, name: await nameOf('A'), delivered: collected };
        });

        expect(outcome.result.error).toBeDefined();
        expect(outcome.result.rolledBack).toEqual(true);
        expect(outcome.name).toEqual('A-original');
        expect(outcome.delivered).toEqual([]);
      },
    );

    it.each(throwers)(
      '%s: a single call returns an error and, under rollbackOnError, restores',
      async (_label, method) => {
        const outcome = await request('A', async () => {
          const result: any = await asyncEngine.execute({ method, params: { rollbackOnError: true } });
          return { result, name: await nameOf('A') };
        });

        expect(outcome.result.error).toBeDefined();
        expect(outcome.name).toEqual('A-original');
      },
    );

    it('a provider whose handleCaughtError returns nothing still yields an error', async () => {
      setStateProvider({ ...asyncGlobalState, handleCaughtError: () => undefined } as any);
      try {
        const outcome = await request('A', async () => {
          const result: any = await asyncEngine.executionQueue([{ method: 'syncBoom' }], true);
          return { result, name: await nameOf('A') };
        });
        expect(outcome.result.error).toEqual('syncBoom');
        expect(outcome.result.rolledBack).toEqual(true);
        expect(outcome.name).toEqual('A-original');
      } finally {
        setStateProvider(asyncGlobalState);
      }
    });

    it('under devContext a throw still surfaces as a rejection, after the rollback', async () => {
      await request('A', async () => {
        setDevContext(true);
        try {
          await expect(asyncEngine.executionQueue([{ method: 'boom' }], true)).rejects.toThrow('boom');
          expect(await nameOf('A')).toEqual('A-original');
        } finally {
          setDevContext(false);
        }
      });
    });
  });
});
