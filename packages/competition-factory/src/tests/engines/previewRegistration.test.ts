import { afterEach, expect, it, vi } from 'vitest';
import { asyncEngine, registerPreviewMethod, tournamentEngine } from '../../index';
import { setClock } from '@Tools/clock';
import { generatePatch } from '@Tools/jsonPatch';
import {
  addNotice,
  deleteNotices,
  getNoticeBuffer,
  getTournamentRecord,
  setStateProvider,
  setSubscriptions,
} from '@Global/state/globalState';
import asyncState from '@Server/providers/factory/engines/asyncGlobalState';
import syncState from '@Global/state/syncGlobalState';
import { setTournamentName } from '@Mutate/tournaments/tournamentDetails';

const id = 'registration';
const frozen = () => Object.freeze({ tournamentId: id, tournamentName: 'entry' });
const unregistered = { code: 'ERR_UNREGISTERED_PREVIEW_METHOD' };

afterEach(() => {
  setClock();
  setStateProvider(syncState);
  tournamentEngine.reset();
});

it('preflights the entire queue before dispatching a registered prefix or an unregistered closure', () => {
  const record = frozen();
  tournamentEngine.setState(record, false);
  const liveFirst = vi.fn(() => ({ success: true }));
  const privateFirst = vi.fn(() => ({ success: true }));
  const unregisteredClosure = vi.fn(() => ({ success: true, seen: record.tournamentName }));
  tournamentEngine.importMethods({ first: liveFirst, last: unregisteredClosure });
  registerPreviewMethod(tournamentEngine, liveFirst, privateFirst);

  const refused = tournamentEngine.dryRun([{ method: 'first' }, { method: 'last' }]);
  expect(refused).toMatchObject({
    wouldSucceed: false,
    error: unregistered,
    results: [],
    patch: [],
    willEmitNotices: [],
  });
  expect(tournamentEngine.explain('last')).toMatchObject({ wouldSucceed: false, reason: unregistered });
  expect(privateFirst).not.toHaveBeenCalled();
  expect(liveFirst).not.toHaveBeenCalled();
  expect(unregisteredClosure).not.toHaveBeenCalled();
  expect(getTournamentRecord(id)).toBe(record);
  expect(record.tournamentName).toBe('entry');

  // The ordinary queue can continue to call both closures.
  tournamentEngine.setState({ ...record }, false);
  expect(tournamentEngine.executionQueue([{ method: 'first' }, { method: 'last' }])).toMatchObject({ success: true });
  expect(liveFirst).toHaveBeenCalledTimes(1);
  expect(unregisteredClosure).toHaveBeenCalledTimes(1);
  expect(privateFirst).not.toHaveBeenCalled();
});

it('dispatches the registered private implementation and invalidates the binding when the live method is replaced', () => {
  const record = frozen();
  tournamentEngine.setState(record, false);
  const live = vi.fn(() => ({ success: true, implementation: 'ordinary' }));
  const replacement = vi.fn(() => ({ success: true, implementation: 'replacement' }));
  let privateCalls = 0;
  tournamentEngine.importMethods({ renameCustom: live });
  registerPreviewMethod(tournamentEngine, live, ({ tournamentRecord }, receiver) => {
    privateCalls++;
    expect(tournamentRecord).not.toBe(record);
    expect(receiver).not.toBe(tournamentEngine);
    if (!tournamentRecord) throw new Error('missing private tournament');
    tournamentRecord.tournamentName = 'private';
    return { success: true, implementation: 'private' };
  });

  const projected = [{ op: 'replace', path: '/registration/tournamentName', value: 'private' }];
  const run = tournamentEngine.dryRun([{ method: 'renameCustom' }]);
  expect(run.error).toBeUndefined();
  expect(run.wouldSucceed).toBe(true);
  expect(run.patch).toEqual(projected);
  expect(run.results).toMatchObject([{ methodName: 'renameCustom', implementation: 'private' }]);
  expect(tournamentEngine.explain('renameCustom').detail.patch).toEqual(projected);
  expect(privateCalls).toBe(2);
  expect(live).not.toHaveBeenCalled();
  expect(getTournamentRecord(id)).toBe(record);
  expect(record.tournamentName).toBe('entry');

  tournamentEngine.importMethods({ renameCustom: replacement });
  expect(tournamentEngine.dryRun([{ method: 'renameCustom' }]).error).toMatchObject(unregistered);
  expect(privateCalls).toBe(2);
  expect(replacement).not.toHaveBeenCalled();
  tournamentEngine.setState({ ...record }, false);
  expect(tournamentEngine.executionQueue([{ method: 'renameCustom' }])).toMatchObject({
    results: [{ implementation: 'replacement' }],
  });
  expect(replacement).toHaveBeenCalledTimes(1);
  expect(live).not.toHaveBeenCalled();
});

it('checks the actual method behind a built-in name', () => {
  const engine = tournamentEngine;
  const override = vi.fn(() => ({ success: true }));
  engine.setState(frozen(), false);
  engine.importMethods({ setTournamentName: override });
  try {
    expect(engine.explain('setTournamentName', { tournamentName: 'unexpected' }).reason).toMatchObject(unregistered);
    expect(override).not.toHaveBeenCalled();
  } finally {
    engine.importMethods({ setTournamentName });
  }
});

it('keeps registration local to an engine even when two instances import the same function', async () => {
  const at = new Date('2026-11-23T00:00:00Z');
  setClock(() => at);
  setStateProvider(asyncState);
  const live = vi.fn(() => ({ success: true, scope: 'live' }));
  let calls = 0;
  await asyncState.runWithInstanceState(async () => {
    const first = asyncEngine(true);
    const second = asyncEngine(true);
    first.importMethods({ custom: live, setTournamentName });
    second.importMethods({ custom: live });
    const record = frozen();
    second.setState(record, false);
    registerPreviewMethod(first, live, async ({ tournamentRecord }, receiver) => {
      await Promise.resolve();
      calls++;
      expect(tournamentRecord).not.toBe(record);
      expect(receiver).not.toBe(first);
      const nested = await receiver.executionQueue([
        { method: 'setTournamentName', params: { tournamentName: 'nested' } },
      ]);
      expect(nested).toMatchObject({ success: true });
      expect(tournamentRecord?.tournamentName).toBe('nested');
      return { success: true, scope: 'first' };
    });
    expect((await second.explain('custom')).reason).toMatchObject(unregistered);
    expect(calls).toBe(0);
    const result = await first.explain('custom');
    expect(result.detail.results).toMatchObject([{ scope: 'first' }]);
    expect(calls).toBe(1);
    expect(live).not.toHaveBeenCalled();
    expect(getTournamentRecord(id)).toBe(record);
    const actual = { ...record };
    first.setState(actual, false);
    expect(
      await first.executionQueue([{ method: 'setTournamentName', params: { tournamentName: 'nested' } }]),
    ).toMatchObject({ success: true });
    expect(actual).toMatchObject({
      tournamentName: 'nested',
      factory: { timeStamp: at.getTime(), version: first.version() },
    });
    expect(result.detail.patch).toEqual(generatePatch({ [id]: record }, { [id]: actual }));
  });
});

it('keeps the preflighted builtin when the parent replaces a later method during an await', async () => {
  setStateProvider(asyncState);
  await asyncState.runWithInstanceState(async () => {
    const engine = asyncEngine(true);
    const record = frozen();
    engine.setState(record, false);
    const liveFirst = vi.fn(() => ({ success: true }));
    const entered = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    const privateFirst = vi.fn(async () => {
      entered.resolve();
      await resume.promise;
      return { success: true };
    });
    const override = vi.fn(() => ({ success: true, fromOverride: true }));
    engine.importMethods({ pause: liveFirst, setTournamentName });
    registerPreviewMethod(engine, liveFirst, privateFirst);
    const rename = { method: 'setTournamentName', params: { tournamentName: 'projected' } };
    const pending = engine.dryRun([{ method: 'pause' }, rename]);
    try {
      await Promise.race([
        entered.promise,
        Promise.resolve(pending).then(() => {
          throw new Error('private directive never suspended');
        }),
      ]);
      expect(getTournamentRecord(id)).toBe(record);
      engine.importMethods({ setTournamentName: override });
    } finally {
      resume.resolve();
    }
    const result = await pending;
    expect(result).toMatchObject({
      wouldSucceed: true,
      results: [
        { methodName: 'pause', success: true },
        { methodName: 'setTournamentName', success: true },
      ],
    });
    expect(result.patch).toEqual([{ op: 'replace', path: '/registration/tournamentName', value: 'projected' }]);
    expect(privateFirst).toHaveBeenCalledTimes(1);
    expect(liveFirst).not.toHaveBeenCalled();
    expect(override).not.toHaveBeenCalled();
    expect(getTournamentRecord(id)).toBe(record);
    expect(record.tournamentName).toBe('entry');
    // Rebinding affects a new preview and the real queue in the parent.
    expect((await engine.dryRun([rename])).error).toMatchObject(unregistered);
    expect(override).not.toHaveBeenCalled();
    engine.setState({ ...record }, false);
    expect(await engine.executionQueue([rename])).toMatchObject({ success: true, results: [{ fromOverride: true }] });
    expect(override).toHaveBeenCalledTimes(1);
  });
});

it('refuses function-valued input before the registered implementation can invoke it', () => {
  const record = frozen();
  tournamentEngine.setState(record, false);
  const callerHook = vi.fn();
  const live = vi.fn(() => ({ success: true }));
  const privateImplementation = vi.fn(({ hook }: { hook: () => void }) => {
    hook();
    return { success: true };
  });
  tournamentEngine.importMethods({ withCallback: live });
  registerPreviewMethod(tournamentEngine, live, privateImplementation);
  const result = tournamentEngine.dryRun([{ method: 'withCallback', params: { hook: callerHook } }]);
  expect(result).toMatchObject({
    wouldSucceed: false,
    error: { code: 'ERR_ROLLBACK_UNAVAILABLE' },
    results: [],
    patch: [],
  });
  expect(callerHook).not.toHaveBeenCalled();
  expect(live).not.toHaveBeenCalled();
  expect(privateImplementation).not.toHaveBeenCalled();
  expect(getTournamentRecord(id)).toBe(record);
});

it.each([false, true])('matches the ordinary nested queue receipt with pending notices (refusal %s)', (refusal) => {
  const topic = 'modifyTournamentDetail';
  const deliveries: { topic: string; payloads: unknown[] }[] = [];
  const start = frozen();
  const later = { method: 'setTournamentName', params: { tournamentName: 'nested' } };
  const directives = refusal ? [later, { method: 'nestedRefusal' }] : [later];
  const refuse = () => ({ error: { code: 'ERR_TEST_REFUSAL', message: 'nested refusal' } });
  const ordinary = vi.fn(() => {
    const nested = tournamentEngine.executionQueue(directives);
    return { success: true, nested };
  });
  tournamentEngine.importMethods({ outerQueue: ordinary, nestedRefusal: refuse });
  registerPreviewMethod(tournamentEngine, refuse, refuse);
  registerPreviewMethod(tournamentEngine, ordinary, (_, receiver) => {
    const nested = receiver.executionQueue(directives);
    expect(nested).not.toBeInstanceOf(Promise);
    return { success: true, nested };
  });
  const setUp = (record: typeof start) => {
    tournamentEngine.setState(record, false);
    setSubscriptions({
      subscriptions: { [topic]: (payloads) => deliveries.push({ topic, payloads: structuredClone(payloads) }) },
    });
    addNotice({ topic, payload: { tournamentId: id, tournamentName: 'pending-at-entry' } });
  };
  setClock(() => new Date('2026-11-23T00:00:00Z'));
  try {
    setUp(start);
    const entryNotices = structuredClone(getNoticeBuffer());
    const preview = tournamentEngine.dryRun([{ method: 'outerQueue' }]);
    expect(preview.wouldSucceed).toBe(true);
    expect(ordinary).not.toHaveBeenCalled();
    expect(getTournamentRecord(id)).toBe(start);
    expect(start).toEqual({ tournamentId: id, tournamentName: 'entry' });
    expect(getNoticeBuffer()).toEqual(entryNotices);
    expect(deliveries).toEqual([]);

    deleteNotices();
    const actual = { ...start };
    setUp(actual);
    const committed = tournamentEngine.executionQueue([{ method: 'outerQueue' }]);
    expect(committed.success).toBe(true);
    expect(ordinary).toHaveBeenCalledTimes(1);
    expect(actual.tournamentName).toBe('nested');
    expect(committed.results[0].nested).toMatchObject(
      refusal
        ? { error: refuse().error, rolledBack: false, results: [{ methodName: 'setTournamentName', success: true }] }
        : { success: true, results: [{ methodName: 'setTournamentName', success: true }] },
    );
    expect(preview.results).toEqual(committed.results);
    expect(preview.patch).toEqual(generatePatch({ [id]: start }, { [id]: actual }));
    expect(deliveries).toMatchObject(
      refusal
        ? []
        : [
            {
              topic,
              payloads: [
                { tournamentId: id, tournamentName: 'pending-at-entry' },
                { tournamentId: id, tournamentName: 'nested' },
              ],
            },
          ],
    );
    expect(preview.willEmitNotices).toEqual(deliveries);
  } finally {
    setClock();
    setSubscriptions({ subscriptions: {} });
    deleteNotices();
  }
});
