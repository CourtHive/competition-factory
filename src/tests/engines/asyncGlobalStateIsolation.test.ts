import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { expect, describe, test } from 'vitest';

// Regression coverage for competition-factory#4564 — the async state provider must give each
// async context its OWN factory engine state. The previous createHook/executionAsyncId/Map
// implementation had never been tested; in production (CFS) a single module-scope seed meant
// every request shared one state object.
//
// HONEST SCOPE: most of these also pass against the OLD createHook implementation. Its
// propagation is call-shape dependent and happens to work under vitest's shape — precisely why
// the defect survived unnoticed for years. A provider unit test cannot reproduce the production
// trigger, which was the module-scope seed in competition-factory-server, not the primitive.
// So do NOT read these as proof the old code was broken. What they do is lock in the properties
// that actually differ (scoped `run`, nested scoping, coherent implicit contexts) and guard
// against regressing away from AsyncLocalStorage.
//
// The real guard against the production defect is structural, not here: every entry point wraps
// itself in runWithInstanceState. `DOCUMENTS THE LIMIT` below exists to stop anyone treating the
// implicit-context safety net as a substitute for that.

const {
  runWithInstanceState,
  createInstanceState,
  getTournamentRecords,
  setTournamentRecord,
  setSubscriptions,
  setTournamentId,
  getNotices,
  addNotice,
} = asyncGlobalState;

const record = (tournamentId: string) => ({ tournamentId, tournamentName: `T-${tournamentId}` });

/** Write one record inside a scoped context, yield, then read the context's records back. */
const scopedWriteThenRead = (tag: string) =>
  runWithInstanceState(async () => {
    setTournamentRecord(record(tag));
    await new Promise((resolve) => setTimeout(resolve, 5));
    return Object.keys(getTournamentRecords());
  });

describe('asyncGlobalState per-context isolation', () => {
  test('concurrent contexts do not share tournamentRecords', async () => {
    // each yields between write and read so siblings interleave
    const [a, b, c] = await Promise.all([scopedWriteThenRead('A'), scopedWriteThenRead('B'), scopedWriteThenRead('C')]);

    expect(a).toEqual(['A']);
    expect(b).toEqual(['B']);
    expect(c).toEqual(['C']);
  });

  test('context survives every await shape', async () => {
    const shapes: [string, () => Promise<unknown>][] = [
      ['await null', async () => null],
      ['await Promise.resolve()', async () => Promise.resolve()],
      ['await setTimeout', async () => new Promise((resolve) => setTimeout(resolve, 1))],
      ['await setImmediate', async () => new Promise((resolve) => setImmediate(resolve))],
      ['await Promise.all', async () => Promise.all([Promise.resolve(1), Promise.resolve(2)])],
    ];

    for (const [label, shape] of shapes) {
      const result: any = await runWithInstanceState(async () => {
        setTournamentId(undefined);
        setTournamentRecord(record('X'));
        await shape();
        return Object.keys(getTournamentRecords());
      });
      expect(result, `context lost after ${label}`).toEqual(['X']);
    }
  });

  test('notices do not leak between concurrent contexts', async () => {
    const request = (tag: string) =>
      runWithInstanceState(async () => {
        // addNotice is a no-op for topics with no subscription in the current context
        setSubscriptions({ subscriptions: { modifyMatchUp: () => undefined } });
        addNotice({ topic: 'modifyMatchUp', payload: { tag } });
        await new Promise((resolve) => setTimeout(resolve, 5));
        // getNotices returns the payloads directly, not a { notices } envelope
        const payloads: any = getNotices({ topic: 'modifyMatchUp' });
        return payloads.map((payload: any) => payload.tag);
      });

    const [a, b] = await Promise.all([request('A'), request('B')]);

    expect(a).toEqual(['A']);
    expect(b).toEqual(['B']);
  });

  test('subscriptions registered in one context are not visible in another', async () => {
    // This is the CFS mis-delivery mechanism: getMutationEngine calls setSubscriptions per
    // request with handlers closing over that request's publicNotices array. With shared
    // state, request B's handlers replace A's process-wide.
    const delivered: string[] = [];

    const request = (tag: string) =>
      runWithInstanceState(async () => {
        setSubscriptions({ subscriptions: { modifyMatchUp: () => delivered.push(tag) } });
        await new Promise((resolve) => setTimeout(resolve, 5));
        const { topics }: any = asyncGlobalState.getTopics();
        await asyncGlobalState.callListener({ topic: 'modifyMatchUp', payloads: [{}] });
        return topics;
      });

    const [a, b] = await Promise.all([request('A'), request('B')]);

    expect(a).toEqual(['modifyMatchUp']);
    expect(b).toEqual(['modifyMatchUp']);
    // each context's own handler fired exactly once — neither was overwritten by the other
    expect(delivered.toSorted((x, y) => x.localeCompare(y))).toEqual(['A', 'B']);
  });

  test('nested contexts do not bleed into the parent', async () => {
    const result: any = await runWithInstanceState(async () => {
      setTournamentRecord(record('OUTER'));
      await runWithInstanceState(async () => {
        setTournamentRecord(record('INNER'));
        return undefined;
      });
      return Object.keys(getTournamentRecords());
    });

    expect(result).toEqual(['OUTER']);
  });

  test('createInstanceState binds the current context', async () => {
    const result: any = await runWithInstanceState(async () => {
      createInstanceState();
      setTournamentRecord(record('SEEDED'));
      await null;
      return Object.keys(getTournamentRecords());
    });

    expect(result).toEqual(['SEEDED']);
  });

  test('an implicit context survives an await, so setState → await → getState stays coherent', async () => {
    const result: any = await (async () => {
      setTournamentRecord(record('IMPLICIT'));
      await new Promise((resolve) => setTimeout(resolve, 5));
      return Object.keys(getTournamentRecords());
    })();

    expect(result).toEqual(['IMPLICIT']);
  });

  test('DOCUMENTS THE LIMIT: implicit creation is a safety net, NOT isolation', async () => {
    // Unwrapped siblings launched from a COMMON parent context still share: the first access
    // binds a store to that shared parent via `enterWith`, and the sibling inherits it. Implicit
    // creation only guarantees state is scoped to a context SUBTREE rather than living
    // process-wide forever. Strictly better than the defect, but not a substitute for wrapping —
    // which is why every real entry point calls runWithInstanceState explicitly.
    const before = asyncGlobalState.implicitContextCreations();

    const unwrapped = (tag: string) =>
      (async () => {
        setTournamentRecord(record(tag));
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Object.keys(getTournamentRecords());
      })();

    const [a, b] = await Promise.all([unwrapped('A'), unwrapped('B')]);
    expect(a).toEqual(['A', 'B']); // shared — the documented limit
    expect(b).toEqual(['A', 'B']);

    // wrapping the SAME calls restores isolation
    expect(await Promise.all([scopedWriteThenRead('A'), scopedWriteThenRead('B')])).toEqual([['A'], ['B']]);

    // and the implicit path is reported, not silent
    expect(asyncGlobalState.implicitContextCreations()).toBeGreaterThan(before);
  });
});
