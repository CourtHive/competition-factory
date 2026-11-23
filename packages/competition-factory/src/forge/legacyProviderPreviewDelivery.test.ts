import alsProvider from '@Server/providers/factory/engines/asyncGlobalState';
import syncProvider from '@Global/state/syncGlobalState';
import { tournamentGovernor } from '@Assemblies/governors';
import {
  deepCopyEnabled,
  setDeepCopy,
  setSubscriptions,
  setGlobalSubscriptions,
  setStateProvider,
  getTournamentRecord,
} from '@Global/state/globalState';
import { registerPreviewMethod } from './previewMethods';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { asyncEngine } from '@Assemblies/engines/async';
import { afterEach, expect, it } from 'vitest';

// The server's ALS provider predates the delivery-scope hook. It keeps the stamp ledger
// on its request store and replaces the entire records map when setState installs one.
const legacy = { ...alsProvider, getDeliveryScope: undefined };
const topic = MODIFY_TOURNAMENT_DETAIL;
const { setTournamentName } = tournamentGovernor;
const collect = (names: string[]) => (items: { tournamentName: string }[]) => {
  names.push(...items.map((item) => item.tournamentName));
};

afterEach(() => {
  setGlobalSubscriptions({ subscriptions: { [topic]: undefined } });
  setStateProvider(syncProvider);
  setDeepCopy(true, { stringify: [], ignore: [], toJSON: [], threshold: undefined });
});

it.each(['awaited', 'detached'] as const)(
  'keeps the %s private receiver from delivering to real subscribers',
  async (kind) => {
    const global: string[] = [],
      outer: string[] = [];
    setStateProvider(legacy);
    setGlobalSubscriptions({ subscriptions: { [topic]: collect(global) } });
    await legacy.runWithInstanceState(async () => {
      const engine = asyncEngine(true);
      const live = { tournamentId: 'outer', tournamentName: 'entry' };
      expect(engine.setState(live, false)).toMatchObject({ success: true });
      setSubscriptions({ subscriptions: { [topic]: collect(outer) } });
      const entered = Promise.withResolvers<void>(),
        resume = Promise.withResolvers<void>();
      let child: Promise<void> | undefined;
      const nested = () => {
        throw new Error('dispatched ordinary closure');
      };
      engine.importMethods({ setTournamentName, nested });
      registerPreviewMethod(engine, nested, async (_, receiver) => {
        entered.resolve();
        child = resume.promise.then(async () => {
          const directives = [{ method: 'setTournamentName', params: { tournamentName: 'private' } }];
          if (kind === 'detached') {
            expect(() => receiver.executionQueue(directives)).toThrow('outside its call');
          } else {
            expect(await receiver.executionQueue(directives)).toMatchObject({ success: true });
          }
        });
        if (kind === 'awaited') await child;
        return { success: true };
      });
      const preview = engine.dryRun([{ method: 'nested' }]);
      await Promise.race([entered.promise, Promise.resolve(preview).then(() => expect(child).toBeDefined())]);
      if (kind === 'detached') expect(await preview).toMatchObject({ wouldSucceed: true });
      try {
        expect(getTournamentRecord('outer')).toBe(live);
        expect(
          await engine.executionQueue([{ method: 'setTournamentName', params: { tournamentName: 'real' } }]),
        ).toMatchObject({ success: true });
      } finally {
        resume.resolve();
      }
      expect(await preview).toMatchObject({ wouldSucceed: true });
      await child;
      expect(global).toEqual(['real']);
      expect(outer).toEqual(['real']);
      expect(live.tournamentName).toBe('real');
      expect(getTournamentRecord('other')).toBeUndefined();
    });
  },
);

it('delivers in a real sibling that selected the same map as the private child', async () => {
  const shared = { shared: { tournamentId: 'shared', tournamentName: 'entry' } };
  const installed = Promise.withResolvers<void>(),
    committed = Promise.withResolvers<void>();
  const global: string[] = [],
    sibling: string[] = [];
  setStateProvider(legacy);
  setGlobalSubscriptions({ subscriptions: { [topic]: collect(global) } });
  const preview = legacy.runWithInstanceState(async () => {
    const engine = asyncEngine(true);
    engine.setState(shared, false);
    const selectShared = () => {
      throw new Error('ordinary closure dispatched');
    };
    engine.importMethods({ setTournamentName, selectShared });
    registerPreviewMethod(engine, selectShared, async ({ tournamentRecord: privateDoc }, receiver) => {
      expect(privateDoc).toBeDefined();
      expect(privateDoc).not.toBe(shared.shared);
      expect(
        await receiver.executionQueue([{ method: 'setTournamentName', params: { tournamentName: 'private' } }]),
      ).toMatchObject({ success: true });
      expect(privateDoc?.tournamentName).toBe('private');
      expect(shared.shared.tournamentName).toBe('entry');
      installed.resolve();
      await committed.promise;
      expect(privateDoc?.tournamentName).toBe('private');
      return { success: true };
    });
    expect(await engine.dryRun([{ method: 'selectShared' }])).toMatchObject({ wouldSucceed: true });
  });
  const real = legacy.runWithInstanceState(async () => {
    try {
      await Promise.race([installed.promise, preview]);
      const engine = asyncEngine(true);
      expect(engine.setState(shared, false)).toMatchObject({ success: true });
      expect(legacy.getTournamentRecords()).toBe(shared);
      engine.importMethods({ setTournamentName });
      setSubscriptions({ subscriptions: { [topic]: collect(sibling) } });
      expect(
        await engine.executionQueue([{ method: 'setTournamentName', params: { tournamentName: 'sibling' } }]),
      ).toMatchObject({ success: true });
    } finally {
      committed.resolve();
    }
  });
  await Promise.all([preview, real]);
  expect(shared.shared.tournamentName).toBe('sibling');
  expect(global).toEqual(['sibling']);
  expect(sibling).toEqual(['sibling']);
});

it('refuses an unregistered method even on a legacy provider without stamp hooks', async () => {
  const opaque = { ...legacy, getCapturedStamps: undefined, setCapturedStamps: undefined };
  setStateProvider(opaque);
  await opaque.runWithInstanceState(async () => {
    const engine = asyncEngine(true);
    const live = { tournamentId: 'outer', tournamentName: 'entry' };
    expect(engine.setState(live, false)).toMatchObject({ success: true });
    let calls = 0;
    engine.importMethods({
      attempt: () => {
        calls++;
        return { success: true };
      },
    });
    const result = await engine.dryRun([{ method: 'attempt' }]);
    expect(result.error).toMatchObject({ code: 'ERR_UNREGISTERED_PREVIEW_METHOD' });
    expect(calls).toBe(0);
    expect(getTournamentRecord('outer')).toBe(live);
    expect(live.tournamentName).toBe('entry');
  });
});

it('keeps sibling default loads borrowed during and after a registered preview', async () => {
  setStateProvider(legacy);
  const options = { ignore: ['parentOnly'], stringify: ['parentId'], toJSON: ['parentDate'], threshold: 8 };
  const changed = { ignore: ['privateOnly'], stringify: ['privateId'], toJSON: ['privateDate'], threshold: 2 };
  const entered = Promise.withResolvers<void>(),
    resume = Promise.withResolvers<void>();
  const preview = legacy.runWithInstanceState(async () => {
    const engine = asyncEngine(true);
    expect(engine.setState({ tournamentId: 'parent' }, false, options)).toMatchObject({ success: true });
    let liveCalls = 0;
    const changeSettings = () => {
      liveCalls++;
      setDeepCopy(true, changed);
      return { success: true };
    };
    engine.importMethods({ changeSettings });
    registerPreviewMethod(engine, changeSettings, async ({ tournamentRecord }) => {
      expect(tournamentRecord?.tournamentId).toBe('parent');
      entered.resolve();
      await resume.promise;
      return { success: true };
    });
    expect(await engine.dryRun([{ method: 'changeSettings' }])).toMatchObject({ wouldSucceed: true });
    expect(liveCalls).toBe(0);
  });
  function defaultSiblingLoad(tournamentId: string) {
    return legacy.runWithInstanceState(() => {
      const engine = asyncEngine(true);
      const record = { tournamentId, events: [{ eventId: 'e' }] };
      expect(deepCopyEnabled()).toMatchObject({ enabled: false, ...options });
      expect(engine.setState(record)).toMatchObject({ success: true });
      expect(getTournamentRecord(tournamentId)).toBe(record);
      expect(getTournamentRecord(tournamentId).events[0]).toBe(record.events[0]);
    });
  }
  try {
    await Promise.race([entered.promise, preview]);
    await defaultSiblingLoad('during');
  } finally {
    resume.resolve();
    await preview;
  }
  await defaultSiblingLoad('after');
});

it('copies nested input aliases into the same private graph as the borrowed record', async () => {
  setStateProvider(legacy);
  await legacy.runWithInstanceState(async () => {
    const engine = asyncEngine(true);
    const event = { eventId: 'e', eventName: 'original' };
    const parent = { tournamentId: 'outer', events: [event] };
    expect(engine.setState(parent, false)).toMatchObject({ success: true });
    const aliases = { events: [event], extensions: [{ name: 'alsoEvent', value: event }] };
    const replace = () => {
      throw new Error('ordinary closure dispatched');
    };
    engine.importMethods({ replace });
    registerPreviewMethod(
      engine,
      replace,
      ({ alias, tournamentRecord }: { alias: typeof aliases; tournamentRecord: typeof parent }) => {
        expect(tournamentRecord).not.toBe(parent);
        expect(alias.events[0]).not.toBe(event);
        expect(alias.events[0]).toBe(tournamentRecord.events[0]);
        expect(alias.events[0]).toBe(alias.extensions[0].value);
        alias.events[0].eventName = 'private';
        expect(event.eventName).toBe('original');
        return { success: true };
      },
    );
    expect(await engine.dryRun([{ method: 'replace', params: { alias: aliases } }])).toMatchObject({
      wouldSucceed: true,
      patch: [{ op: 'replace', path: '/outer/events/0/eventName', value: 'private' }],
    });
    expect(getTournamentRecord('outer')).toBe(parent);
    expect(parent.events[0]).toBe(event);
    expect(event.eventName).toBe('original');
    expect(getTournamentRecord('new')).toBeUndefined();
  });
});
