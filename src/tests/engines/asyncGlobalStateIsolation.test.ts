import asyncGlobalState from '@Server/providers/factory/engines/asyncGlobalState';
import { expect, describe, test } from 'vitest';

// Regression coverage for competition-factory#4564 — the async state provider must give each
// async context its OWN factory engine state. The previous createHook/executionAsyncId/Map
// implementation had never been tested; in production (CFS) a single module-scope seed meant
// every request shared one state object.
//
// HONEST SCOPE: measured against the old implementation, 3 of these fail (nested scoping,
// createInstanceState binding, fail-closed read) and 4 pass. The old primitive's propagation is
// call-shape dependent — it happens to work under vitest's shape, which is precisely why the
// defect survived unnoticed. A unit test cannot reproduce the production trigger (module-scope
// seeding + the CFS request shape), so do NOT read these as proof the old code was broken; they
// lock in the properties that actually differ and guard against regressing away from
// AsyncLocalStorage. The fail-closed test is the load-bearing one: it is what turns "silently
// shared one process-wide state" into a loud error.

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

describe('asyncGlobalState per-context isolation', () => {
  test('concurrent contexts do not share tournamentRecords', async () => {
    const request = (tag: string) =>
      runWithInstanceState(async () => {
        setTournamentRecord(record(tag));
        // yield so the sibling context interleaves between write and read
        await new Promise((resolve) => setTimeout(resolve, 5));
        return Object.keys(getTournamentRecords());
      });

    const [a, b, c] = await Promise.all([request('A'), request('B'), request('C')]);

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

  test('reading state with no context established throws rather than falling back', () => {
    // fail-closed: a permissive default would silently reintroduce one shared process-wide
    // state, which is the defect this provider replaces
    expect(() => getTournamentRecords()).toThrow(/No factory instance state/);
  });
});
