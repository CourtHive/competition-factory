import { deferredQuery, deferredQueryBinding } from '@Mutate/notifications/drawNotifications';
import { MISSING_ASYNC_STATE_PROVIDER, ROLLBACK_UNAVAILABLE } from '@Constants/errorConditionConstants';
import { getLoadedFootprint, markLoadedFootprint } from '@Global/state/loadedFootprint';
import { createSeededRandom, randomSource, type SeededRandom } from '@Tools/prng';
import syncGlobalState from '@Global/state/syncGlobalState';
import { isPlainContainer } from '@Tools/cloneState';
import {
  getCapturedStamps,
  getNoticeBuffer,
  getProvider,
  getTopics,
  getTournamentId,
  getTournamentRecords,
} from '@Global/state/globalState';

import type { TournamentRecords } from '@Types/factoryTypes';
import type { Directives } from '@Assemblies/engines/types/engineTypes';
import { originalNoticeValue } from '@Global/state/noticePayloadAudit';

export type PrivateState = {
  before: TournamentRecords;
  directives: Directives<string>;
  topics: string[];
  isCurrent: () => boolean;
};

const subscribe = () => undefined;

/** Only the child store receives writes. A legacy request provider can identify its child by its own records map. */
export function withPreviewState<T>(
  directives: Directives<string>,
  asyncEngine: boolean,
  clocks: { record: number; competition?: number },
  run: (state: PrivateState) => T,
) {
  const provider = getProvider();
  if (!provider.runWithInstanceState || !provider.setCapturedClock || !provider.getCapturedClock)
    return { error: ROLLBACK_UNAVAILABLE };
  if (asyncEngine && provider.runWithInstanceState === syncGlobalState.runWithInstanceState)
    return { error: MISSING_ASYNC_STATE_PROVIDER };

  const live = getTournamentRecords();
  const tournamentId = getTournamentId();
  const scope = provider.getDeliveryScope?.();
  const topics = getTopics().topics;
  // Legacy providers without either reader use their default enabled configuration.
  const disabled = provider.notificationsDisabled?.() ?? provider.getNoticeState?.()?.disableNotifications;
  const source = randomSource() as SeededRandom;
  const stamps = new WeakSet<object>();
  const copy = privateCopier(getCapturedStamps(), stamps);
  let before: TournamentRecords;
  let records: TournamentRecords;
  let privateDirectives: Directives<string>;
  let buffer: ReturnType<typeof getNoticeBuffer>;
  try {
    const projection = provider.makeDeepCopy
      ? provider.makeDeepCopy(live, false, true, false, { purpose: 'snapshot' })
      : live;
    if (
      !projection ||
      Object.keys(live).some((id) => projection[id]?.tournamentId !== id || !isPlainContainer(projection[id]))
    )
      return { error: ROLLBACK_UNAVAILABLE };
    ({ working: records, before } = copy(projection, true));
    for (const id of Object.keys(live)) {
      const footprint = getLoadedFootprint(live[id]);
      if (footprint) markLoadedFootprint(records[id], copy(footprint, false).working);
    }
    privateDirectives = copy(directives, false).working;
    const notices = getNoticeBuffer();
    buffer = notices?.length ? copy(notices, false, true).working : undefined;
  } catch {
    return { error: ROLLBACK_UNAVAILABLE };
  }

  return provider.runWithInstanceState(() => {
    // Check BEFORE installing clocks or records: a provider accidentally running in the caller must stay untouched.
    if (provider.getTournamentRecords() === live || (scope && scope === provider.getDeliveryScope?.()))
      return { error: ROLLBACK_UNAVAILABLE };
    provider.setCapturedClock(clocks.record);
    provider.setCapturedCompetitionClock?.(clocks.competition);
    provider.setCapturedStamps?.(stamps);
    provider.setCallRandomSource?.(typeof source.state === 'function' ? createSeededRandom(source.state()) : source);
    provider.setTournamentRecords(records);
    provider.setTournamentId(tournamentId);
    if (topics.length)
      provider.setSubscriptions({ subscriptions: Object.fromEntries(topics.map((t) => [t, subscribe])) });
    if (buffer) provider.setNoticeBuffer?.(buffer);
    if (disabled) provider.disableNotifications();
    return run({
      before,
      directives: privateDirectives,
      topics,
      isCurrent: () => getProvider() === provider && provider.getTournamentRecords() === records,
    });
  });
}

/** Detach a nested queue input or an observed delivery at the point it crosses the private boundary. */
export function copyPreviewValue<T>(value: T): T {
  return privateCopier()(value, false).working;
}

type CopyPair = { working: any; before?: any };

// Every object in a record, notice or directive has one working identity. Only records need a baseline.
function privateCopier(parentStamps?: WeakSet<object>, privateStamps?: WeakSet<object>) {
  const copies = new Map<object, CopyPair>();
  function copy(source: any, record: boolean, notice = false): CopyPair {
    // A retained notice view can reference an entity already copied from the record or a directive.
    /* v8 ignore next -- @preserve: compiled out of every published bundle */
    if (__NOTICE_PAYLOAD_DIAGNOSTICS__) source = originalNoticeValue(source);
    if (source == null || (typeof source !== 'object' && typeof source !== 'function'))
      return { working: source, before: source };
    const existing = copies.get(source);
    if (existing) return existing;

    if (typeof source === 'function') {
      if (!notice) throw new TypeError('Callback in preview record or directive');
      const binding = deferredQueryBinding(source);
      if (!binding) throw new TypeError('Unbound callback in preview input');
      const working = deferredQuery(binding.query, undefined);
      copies.set(source, { working });
      deferredQueryBinding(working)!.args = copy(binding.args, false, true).working;
      return { working };
    }

    if (source instanceof Map || source instanceof Set) return copyCollection(source, record, notice);
    if (!isPlainContainer(source)) return copyOpaque(source, record, notice);

    const working = emptyContainer(source);
    const before = record ? emptyContainer(source) : undefined;
    const pair = { working, before };
    copies.set(source, pair);
    if (parentStamps?.has(source)) privateStamps!.add(working);
    for (const key of enumerableKeys(source)) {
      const field = Object.getOwnPropertyDescriptor(source, key)!;
      if (!('value' in field)) throw new TypeError('Accessor in preview input');
      const value = field.value;
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        const child = copy(value, record, notice);
        writeField(working, key, child.working);
        if (before) writeField(before, key, child.before);
      } else {
        writeField(working, key, value);
        if (before) writeField(before, key, value);
      }
    }
    return pair;
  }
  function copyCollection(source: Map<unknown, unknown> | Set<unknown>, record: boolean, notice: boolean): CopyPair {
    const create = () => (source instanceof Map ? new Map() : new Set());
    const working = create(),
      before = record ? create() : undefined;
    const pair = { working, before };
    copies.set(source, pair);
    for (const [key, value] of source.entries()) {
      const item = copy(value, record, notice);
      if (working instanceof Map) {
        const id = copy(key, record, notice);
        working.set(id.working, item.working);
        if (before instanceof Map) before.set(id.before, item.before);
      } else {
        working.add(item.working);
        if (before instanceof Set) before.add(item.before);
      }
    }
    return pair;
  }

  function copyOpaque(source: any, record: boolean, notice: boolean): CopyPair {
    if (
      typeof SharedArrayBuffer !== 'undefined' &&
      (source instanceof SharedArrayBuffer ||
        (ArrayBuffer.isView(source) && source.buffer instanceof SharedArrayBuffer))
    ) {
      throw new TypeError('Shared memory requires a private record projection');
    }
    const detached = structuredClone(source);
    // A driver value may serialize to a plain object. Walk that projection as data as well.
    const pair = isPlainContainer(detached)
      ? copy(detached, record, notice)
      : { working: detached, before: record ? structuredClone(detached) : undefined };
    copies.set(source, pair);
    return pair;
  }

  return copy;
}

function emptyContainer(source: object): any {
  if (Array.isArray(source)) return new Array(source.length);
  return Object.getPrototypeOf(source) === null ? Object.create(null) : {};
}

function enumerableKeys(source: object): (string | symbol)[] {
  const keys: (string | symbol)[] = Object.keys(source);
  for (const symbol of Object.getOwnPropertySymbols(source))
    if (Object.prototype.propertyIsEnumerable.call(source, symbol)) keys.push(symbol);
  return keys;
}

function writeField(target: any, key: string | symbol, value: any) {
  if (key === '__proto__') {
    Object.defineProperty(target, key, { value, enumerable: true, writable: true, configurable: true });
  } else {
    target[key] = value;
  }
}
