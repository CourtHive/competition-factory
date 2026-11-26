import { addNotice, setStateProvider, setSubscriptions } from '@Global/state/globalState';
import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import syncGlobalState from '@Global/state/syncGlobalState';
import tournamentEngine from '@Engines/syncEngine';
import * as governors from '@Assemblies/governors';
import asyncEngine from '@Engines/asyncEngine';
import { bulkItem } from '@Mutate/bulkItem';

// constants
import { MUTATIONS } from '@Constants/topicConstants';

/**
 * COMMITTED WORK ANNOUNCES ITSELF. A bulk mutation commits each item on its own and returns
 * the first refused item as its own `error`. When it committed at least one item it also returns `committed: true`, and
 * the engine publishes the buffered notices instead of deleting them. A refused item buffers nothing. With rollback the
 * whole call is restored and nothing is published (a caller-requested rollback stays a transaction). In a queue
 * without rollback a directive that partly commits publishes the queue's buffer, the notices of the directives before
 * it included: the one deviation from D2 (mutation-engines.md § Transaction Pattern).
 *
 * `partly` stands for a bulk writer: each item names a value; `bad` is refused, writing nothing; any other is appended to
 * the tournament name and announced. Each item runs inside `bulkItem`, the boundary the refusal invariant attributes
 * each write by.
 */
const TOPIC = 'partialCommitNotices';
const REFUSAL = { message: 'refused item', code: 'ERR_REFUSED_ITEM' };

function partly({ tournamentRecord, items }: { tournamentRecord: any; items: string[] }) {
  const results = items.map((item) =>
    bulkItem((): { success?: boolean; error?: typeof REFUSAL } => {
      if (item === 'bad') return { error: REFUSAL };
      tournamentRecord.tournamentName = `${tournamentRecord.tournamentName}+${item}`;
      addNotice({ topic: TOPIC, payload: { item }, key: item });
      return { success: true };
    }),
  );
  const refused = results.find((result) => result.error);
  if (!refused) return { success: true, results };
  return { ...refused, ...(results.some((result) => result.success) ? { committed: true } : {}), results };
}
function rename({ tournamentRecord, name }: { tournamentRecord: any; name: string }) {
  tournamentRecord.tournamentName = name;
  addNotice({ topic: TOPIC, payload: { item: name }, key: name });
  return { success: true };
}
function refuse() {
  return { error: REFUSAL };
}
const methods = { partly, rename, refuse };

const original = () => ({ tournamentId: 'T', tournamentName: 'T' });

function watch() {
  const delivered: string[] = [];
  const mutations: string[][] = [];
  setSubscriptions({
    subscriptions: {
      [TOPIC]: (payloads: any[]) => delivered.push(...payloads.map((payload) => payload.item)),
      [MUTATIONS]: (payloads: any[]) =>
        mutations.push(
          ...payloads.map((payload) =>
            payload.directives.map(({ method }: any) => (typeof method === 'function' ? method.name : method)),
          ),
        ),
    },
  });
  return { delivered, mutations };
}

afterEach(() => setSubscriptions({}));

describe('sync engine', () => {
  const setup = () => {
    tournamentEngine.importMethods(methods);
    tournamentEngine.setState(original());
    return watch();
  };
  const name = () => tournamentEngine.getTournament().tournamentRecord.tournamentName;

  it('a direct call that commits some items publishes their notices in order; the refused item is silent', () => {
    const { delivered, mutations } = setup();
    const result: any = tournamentEngine.partly({ items: ['a', 'bad', 'b'] });
    expect(result.error).toEqual(REFUSAL);
    expect(result.committed).toEqual(true);
    expect(name()).toEqual('T+a+b');
    expect(delivered).toEqual(['a', 'b']);
    expect(mutations).toEqual([['partly']]);
  });

  it('a direct call that commits nothing publishes nothing, as before', () => {
    const { delivered } = setup();
    const result: any = tournamentEngine.partly({ items: ['bad', 'bad'] });
    expect(result.error).toEqual(REFUSAL);
    expect(result.committed).toBeUndefined();
    expect(name()).toEqual('T');
    expect(delivered).toEqual([]);
  });

  it('a successful call is unchanged', () => {
    const { delivered } = setup();
    expect(tournamentEngine.partly({ items: ['a', 'b'] }).success).toEqual(true);
    expect(delivered).toEqual(['a', 'b']);
  });

  it('with rollbackOnError the whole call is restored and nothing is published', () => {
    const { delivered, mutations } = setup();
    const result: any = tournamentEngine.partly({ items: ['a', 'bad', 'b'], rollbackOnError: true });
    expect(result.error).toEqual(REFUSAL);
    expect(name()).toEqual('T');
    expect(delivered).toEqual([]);
    expect(mutations).toEqual([]);
  });

  it('doNotNotify still publishes nothing; the buffer is not carried to the next call', () => {
    const { delivered } = setup();
    tournamentEngine.partly({ items: ['a', 'bad'], doNotNotify: true });
    expect(delivered).toEqual([]);
    tournamentEngine.rename({ name: 'next' });
    expect(delivered).toEqual(['next']);
  });

  it('a queue without rollback publishes its buffer when a directive partly commits: the D2 deviation', () => {
    const { delivered, mutations } = setup();
    const result: any = tournamentEngine.executionQueue([
      { method: 'rename', params: { name: 'R' } },
      { method: 'partly', params: { items: ['a', 'bad'] } },
      { method: 'rename', params: { name: 'never' } },
    ]);
    expect(result.error).toEqual(REFUSAL);
    expect(result.rolledBack).toEqual(false);
    // the refused bulk directive is listed with its whole result, its per-item results included
    expect(result.results.map((entry: any) => entry.methodName)).toEqual(['rename', 'partly']);
    expect(result.results[1].results).toEqual([{ success: true }, { error: REFUSAL }]);
    expect(result.results[1].committed).toEqual(true);
    expect(name()).toEqual('R+a');
    // committed work announces itself: the earlier directive's notice is published with the partly committed one's
    expect(delivered).toEqual(['R', 'a']);
    // and the mutation notice names the directives that ran, not the one after the refusal
    expect(mutations).toEqual([['rename', 'partly']]);
  });

  it('a queue without rollback whose refusing directive committed nothing publishes nothing, as D2 says', () => {
    const { delivered } = setup();
    const result: any = tournamentEngine.executionQueue([
      { method: 'rename', params: { name: 'R' } },
      { method: 'refuse' },
    ]);
    expect(result.error).toEqual(REFUSAL);
    // a refused directive that is not a bulk call is not listed, as before
    expect(result.results).toEqual([{ success: true, methodName: 'rename' }]);
    expect(name()).toEqual('R');
    expect(delivered).toEqual([]);
  });

  it('a queue with rollback is restored whole and publishes nothing', () => {
    const { delivered } = setup();
    const result: any = tournamentEngine.executionQueue(
      [
        { method: 'rename', params: { name: 'R' } },
        { method: 'partly', params: { items: ['a', 'bad'] } },
      ],
      true,
    );
    expect(result.rolledBack).toEqual(true);
    expect(name()).toEqual('T');
    expect(delivered).toEqual([]);
  });
});

describe('async engine', () => {
  beforeAll(() => setStateProvider(asyncGlobalState));
  afterAll(() => setStateProvider(syncGlobalState));

  const request = <T>(body: (watched: ReturnType<typeof watch>) => Promise<T>) =>
    asyncGlobalState.runWithInstanceState(async () => {
      asyncEngine.importMethods(methods);
      asyncEngine.importMethods(governors, true, 1);
      await asyncEngine.setState([original()]);
      await asyncEngine.setTournamentId('T');
      return body(watch());
    });
  const name = async () => (await asyncEngine.getTournament({ tournamentId: 'T' })).tournamentRecord?.tournamentName;

  it('a direct call that partly commits publishes the committed items in order', async () => {
    const { delivered, named } = await request(async (watched) => {
      const result: any = await asyncEngine.partly({ items: ['a', 'bad', 'b'] });
      expect(result.committed).toEqual(true);
      return { ...watched, named: await name() };
    });
    expect(named).toEqual('T+a+b');
    expect(delivered).toEqual(['a', 'b']);
  });

  it('with rollbackOnError the call is restored and nothing is published', async () => {
    const { delivered, named } = await request(async (watched) => {
      await asyncEngine.partly({ items: ['a', 'bad'], rollbackOnError: true });
      return { ...watched, named: await name() };
    });
    expect(named).toEqual('T');
    expect(delivered).toEqual([]);
  });

  it('a queue without rollback publishes its buffer; with rollback nothing', async () => {
    const queue = [
      { method: 'rename', params: { name: 'R' } },
      { method: 'partly', params: { items: ['a', 'bad'] } },
    ];
    const kept = await request(async (watched) => {
      const result: any = await asyncEngine.executionQueue(queue);
      expect(result.rolledBack).toEqual(false);
      expect(result.results.map((entry: any) => entry.methodName)).toEqual(['rename', 'partly']);
      expect(result.results[1].results).toEqual([{ success: true }, { error: REFUSAL }]);
      return { ...watched, named: await name() };
    });
    expect(kept.named).toEqual('R+a');
    expect(kept.delivered).toEqual(['R', 'a']);
    expect(kept.mutations).toEqual([['rename', 'partly']]);

    const restored = await request(async (watched) => {
      const result: any = await asyncEngine.executionQueue(queue, true);
      expect(result.rolledBack).toEqual(true);
      return { ...watched, named: await name() };
    });
    expect(restored.named).toEqual('T');
    expect(restored.delivered).toEqual([]);
  });
});
