import {
  addNotice,
  callListener,
  DEFERRED_PAYLOAD,
  type Notice,
  getOutcomePipeline,
  getProvider,
  setOutcomePipeline as selectPipeline,
  setStateProvider,
} from '@Global/state/globalState';
import {
  noticePayloadTestMode,
  takeNoticePayloadViolations,
  type AuditedOutcomePipelineSelector,
} from '@Global/state/noticePayloadAudit';
import { notifySubscribersAsync } from '@Global/state/notifySubscribers';
import { liveNoticeEffects } from '@Mutate/notifications/drawNotifications';
import asyncProvider from '../../../examples/asyncEngine/asyncGlobalState';
import syncGlobalState from '@Global/state/syncGlobalState';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';

// The read-only notice payload detector (notice payloads are read-only; cases from factory #6614). Write checks run
// where the detector is compiled in (NOTICE_PAYLOAD_WRITE_CHECK=1); passive cases run in every suite, with it
// compiled in or out.
const audit = __NOTICE_PAYLOAD_DIAGNOSTICS__;
const setOutcomePipeline = selectPipeline as AuditedOutcomePipelineSelector;
const previousProvider = getProvider();
const previousPipeline = getOutcomePipeline();
const previousTestMode = noticePayloadTestMode.enabled;
const violation = /read-only notice payload/;

beforeEach(() => {
  noticePayloadTestMode.enabled = false;
  setOutcomePipeline('v2');
});
afterEach(() => {
  // the writes below are attempted on purpose; the suite's write check fails on any left over
  takeNoticePayloadViolations();
  noticePayloadTestMode.enabled = previousTestMode;
  setStateProvider(previousProvider);
  setOutcomePipeline(previousPipeline);
});

it.each(audit ? ['ordinary', 'testing', 'differential'] : ['ordinary'])(
  'preserves lazy delivery and alias relationships in %s mode',
  async (mode) => {
    const match = { winningSide: 1 };
    const matches = new WeakSet([match]);
    const inherited = { kind: 'match' };
    const built = Object.assign(Object.create(inherited), { match, alias: match, proto: inherited });
    const build = vi.fn(() => built);
    const notice = { topic: 'deferred', payload: { [DEFERRED_PAYLOAD]: build, match } };
    let enqueued: typeof notice;
    const provider = {
      ...syncGlobalState,
      addNotice(input: typeof notice) {
        expect(this).toBe(provider);
        enqueued = input;
        expect(matches.has(input.payload.match)).toBe(mode === 'ordinary');
      },
      getTopics: () => ({ topics: ['deferred'] }),
      getPayloads: () => [enqueued.payload],
      callListener: vi.fn(function (this: unknown, { payloads, notices }) {
        expect(this).toBe(provider);
        expect(notices === payloads).toBe(true);
        const [first] = payloads;
        expect(first === built).toBe(mode === 'ordinary');
        expect(first.proto === Object.getPrototypeOf(first)).toBe(true);
        expect(Object.getOwnPropertyDescriptor(first, 'match')?.value === first.alias).toBe(true);
        expect(first.match === enqueued.payload.match).toBe(true);
      }),
    };
    setStateProvider(provider);
    noticePayloadTestMode.enabled = mode === 'testing';
    setOutcomePipeline(mode === 'differential' ? 'differential' : 'v2', {
      checkNoticePayloadWrites: mode === 'differential',
    });
    expect(getProvider()).toBe(provider);
    addNotice(notice);
    expect(build).not.toHaveBeenCalled();
    await notifySubscribersAsync();
    expect(build).toHaveBeenCalledTimes(1);
    expect(provider.callListener).toHaveBeenCalledTimes(1);
  },
);

it.runIf(audit)(
  'rejects attempts on retained nested values, descriptors, arrays, functions, dates and collection entries',
  () => {
    setOutcomePipeline('differential', { checkNoticePayloadWrites: true });
    const item = { n: 1 };
    const date = new Date(10);
    const fn = Object.assign(() => item, { item });
    const payload = Object.freeze({
      item,
      fn,
      date,
      list: [item],
      map: new Map([[item, item]]),
      set: new Set([item]),
    });
    let held: typeof payload;
    setStateProvider({
      ...syncGlobalState,
      addNotice(notice: Notice) {
        held = notice.payload;
      },
    });
    addNotice({ topic: 'arbitrary', payload });
    setOutcomePipeline('v1');
    const value = held!;
    expect(value.date.getTime()).toBe(10);
    expect([...value.list][0] === value.item).toBe(true);
    expect(value.fn() === value.fn.item).toBe(true);
    expect(value.map.get(value.item) === value.item).toBe(true);
    expect(value.set.size).toBe(1);
    expect([...value.map][0][1] === [...value.set][0]).toBe(true);
    const attempts = [
      () => {
        value.item.n = 1;
      },
      () => {
        value.item.n = 2;
        value.item.n = 1;
      },
      () => Reflect.deleteProperty(value.item, 'absent'),
      () => Object.defineProperty(value.item, 'n', { value: 1 }),
      () => Reflect.setPrototypeOf(value.item, Object.getPrototypeOf(value.item)),
      () => Reflect.preventExtensions(value.item),
      () => value.list.push(item),
      () => Reflect.set(value.fn, 'item', item),
      () => {
        Object.getOwnPropertyDescriptor(value, 'item')!.value.n = 1;
      },
      () => value.date.setTime(10),
      () => value.map.clear(),
      () => value.set.delete(item),
      () => {
        value.map.values().next().value!.n = 1;
      },
    ];
    for (const write of attempts) expect(write).toThrow(violation);
    expect(takeNoticePayloadViolations()).toHaveLength(attempts.length);
    expect(item.n).toBe(1);
    expect(date.getTime()).toBe(10);
  },
);

it.runIf(audit)(
  'fails inside a custom provider and during synchronous and asynchronous subscriber delivery',
  async () => {
    const payload = { score: 3 };
    setOutcomePipeline('differential', { checkNoticePayloadWrites: true });
    setStateProvider({
      ...syncGlobalState,
      addNotice(notice: Notice) {
        notice.payload.score = 3;
      },
    });
    expect(() => addNotice({ topic: 'score', payload })).toThrow(violation);
    expect(() => liveNoticeEffects.addNotice({ topic: 'score', payload })).toThrow(violation);
    const provider = {
      ...syncGlobalState,
      getTopics: () => ({ topics: ['score'] }),
      getPayloads: () => [payload],
      callListener: syncGlobalState.callListener,
    };
    setStateProvider(provider);
    syncGlobalState.setSubscriptions({
      subscriptions: {
        score: ([p]) => {
          p.score = 3;
        },
      },
    });
    try {
      // a synchronous subscriber's write rejects the delivery, as any subscriber throw does in production
      await expect(callListener({ topic: 'score', payloads: [payload], notices: [payload] })).rejects.toThrow(
        violation,
      );
      await expect(notifySubscribersAsync()).rejects.toThrow(violation);
      setStateProvider({
        ...provider,
        async callListener({ notices }: { notices: { missing?: unknown }[] }) {
          await Promise.resolve();
          delete notices[0].missing;
        },
      });
      await expect(notifySubscribersAsync()).rejects.toThrow(violation);
      expect(takeNoticePayloadViolations()).toHaveLength(5);
      setOutcomePipeline();
      await expect(callListener({ topic: 'score', notices: [payload] })).resolves.toBeUndefined();
    } finally {
      syncGlobalState.setSubscriptions({ subscriptions: {} });
    }
    expect(payload.score).toBe(3);
  },
);

it.each(audit ? (['v2', 'differential'] as const) : (['v2'] as const))(
  'reads Date, Map and Set values and coalesces keyed notices in %s',
  async (mode) => {
    const match = { label: 'M' };
    const date = new Date(42);
    const payload = { match, map: new Map([[match, date]]), set: new Set([match]) };
    setOutcomePipeline(mode, { checkNoticePayloadWrites: mode === 'differential' });
    setStateProvider(asyncProvider);
    await asyncProvider.runWithInstanceState(async () => {
      const subscriber = vi.fn(async ([p]) => {
        await Promise.resolve();
        expect(p.eventId).toBe('e');
        expect(p.match === match).toBe(mode === 'v2');
        expect(p.map.size).toBe(1);
        expect(p.map.has(p.match)).toBe(true);
        expect(p.map.get(p.match).toISOString()).toBe(date.toISOString());
        expect([...p.map.keys()][0] === p.match).toBe(true);
        expect([...p.set][0] === p.match).toBe(true);
        p.map.forEach((v, k, m) => {
          expect(m === p.map && k === p.match && v === p.map.get(k)).toBe(true);
        });
        if (mode === 'differential') Reflect.deleteProperty(p.match, 'missing');
      });
      asyncProvider.setSubscriptions({ subscriptions: { match: subscriber } });
      addNotice({ topic: 'match', key: 'M', payload: { eventId: 'e' } });
      addNotice({ topic: 'match', key: 'M', payload });
      if (mode === 'differential') await expect(notifySubscribersAsync()).rejects.toThrow(violation);
      else await notifySubscribersAsync();
      expect(subscriber).toHaveBeenCalledTimes(1);
      expect(payload).not.toHaveProperty('eventId');
    });
  },
);

it('keeps passive delivery cloneable in ordinary differential', () => {
  const match = { winningSide: 2 };
  let delivered: unknown;
  setStateProvider({
    ...syncGlobalState,
    addNotice(notice: Notice) {
      expect(notice.payload.match).toBe(match);
      delivered = structuredClone(notice.payload);
    },
  });
  expect(setOutcomePipeline('differential').success).toBe(true);
  addNotice({ topic: 'score', payload: { match } });
  expect(delivered).toEqual({ match });
});

it.runIf(audit)('offers the write check in the differential only', () => {
  expect(setOutcomePipeline('differential').success).toBe(true);
  for (const mode of ['v1', 'v2'] as const) {
    expect(setOutcomePipeline(mode, { checkNoticePayloadWrites: true }).error).toBeDefined();
    expect(getOutcomePipeline()).toBe('differential');
  }
  expect(setOutcomePipeline('differential', { checkNoticePayloadWrites: true }).success).toBe(true);
  const item = { n: 1 };
  let held: typeof item | undefined;
  setStateProvider({
    ...syncGlobalState,
    addNotice(notice: Notice) {
      held = notice.payload;
    },
  });
  addNotice({ topic: 'score', payload: item });
  expect(held).not.toBe(item);
  // any later selection without the option resumes raw delivery
  expect(setOutcomePipeline('differential').success).toBe(true);
  addNotice({ topic: 'score', payload: item });
  expect(held).toBe(item);
});
