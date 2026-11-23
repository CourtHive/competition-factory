import { deferredQuery, deferredQueryBinding } from '@Mutate/notifications/drawNotifications';
import { createSeededRandom, randomSource, SeededRandom } from '@Tools/prng';
import { ROLLBACK_UNAVAILABLE } from '@Constants/errorConditionConstants';
import { Directives, TournamentRecords } from '@Types/factoryTypes';
import { suppressPreviewDelivery } from '@Global/state/noticeIdentity';
import { isPlainContainer } from '@Tools/cloneState';
import {
  getCapturedStamps,
  getNoticeBuffer,
  getProvider,
  getTournamentId,
  getTournamentRecords,
  setCallRandomSource,
  setCapturedClock,
  setCapturedCompetitionClock,
  setCapturedStamps,
} from '@Global/state/globalState';

const subscribe = () => undefined;

/** A preview has no live writes to undo. Its provider must be able to bind an independent child state. */
export function withPreviewState<T>(
  directives: Directives,
  clocks: { record: number; competition?: number },
  run: (before: TournamentRecords, directives: Directives) => T,
) {
  const provider = getProvider();
  if (typeof provider.runWithInstanceState !== 'function') return { error: ROLLBACK_UNAVAILABLE };

  const live = getTournamentRecords();
  const projection = provider.makeDeepCopy
    ? provider.makeDeepCopy(live, false, true, false, { purpose: 'snapshot' })
    : live;
  if (
    !projection ||
    Object.keys(live).some((id) => projection[id]?.tournamentId !== id || !isPlainContainer(projection[id]))
  ) {
    return { error: ROLLBACK_UNAVAILABLE };
  }

  const tournamentId = getTournamentId();
  const methods = provider.getMethods();
  const topics: string[] = provider.getTopics().topics;
  const disabled = provider.notificationsDisabled?.() ?? provider.getNoticeState?.()?.disableNotifications;
  const source = randomSource() as SeededRandom;
  const notices = getNoticeBuffer();
  const parentStamps = getCapturedStamps();
  const privateStamps = new WeakSet<object>();
  let before: TournamentRecords;
  let records: TournamentRecords;
  let privateDirectives: Directives;
  let buffer: typeof notices;
  try {
    // Copy both roots together. A buffered payload may point to an entity a directive will modify.
    const copy = privateCopier(parentStamps, privateStamps);
    // A callback may re-enter a request with the same borrowed record and commit independently.
    // Keep the patch baseline and working copy together, reading each source field once.
    ({ before, working: records } = copy(projection, true));
    privateDirectives = copy(directives, false).working;
    buffer = notices?.length ? copy(notices, false).working : undefined;
  } catch {
    return { error: ROLLBACK_UNAVAILABLE };
  }

  return provider.runWithInstanceState(() => {
    provider.setTournamentRecords(records);
    provider.setTournamentId(tournamentId);
    provider.setMethods?.(methods, { privateRegistry: true });
    suppressPreviewDelivery(provider);
    if (topics.length)
      provider.setSubscriptions({ subscriptions: Object.fromEntries(topics.map((t) => [t, subscribe])) });
    if (buffer) provider.setNoticeBuffer?.(buffer);
    if (disabled) provider.disableNotifications();
    setCapturedClock(clocks.record);
    setCapturedCompetitionClock(clocks.competition);
    setCapturedStamps(privateStamps);
    setCallRandomSource(typeof source.state === 'function' ? createSeededRandom(source.state()) : source);
    return run(before, privateDirectives);
  }) as T;
}

type CopyPair = { working: any; before?: any };

// Every object in a record, notice or directive has one working identity. Only records need a baseline.
function privateCopier(parentStamps?: WeakSet<object>, privateStamps?: WeakSet<object>) {
  const copies = new Map<object, CopyPair>();
  function copy(source: any, record: boolean): CopyPair {
    if (source == null || (typeof source !== 'object' && typeof source !== 'function'))
      return { working: source, before: source };
    const existing = copies.get(source);
    if (existing) return existing;

    if (typeof source === 'function') {
      if (record) throw new TypeError('Uncopyable record field');
      const binding = deferredQueryBinding(source);
      if (!binding) return { working: source };
      const working = deferredQuery(binding.query, undefined);
      copies.set(source, { working });
      deferredQueryBinding(working)!.args = copy(binding.args, false).working;
      return { working };
    }

    if (source instanceof Map || source instanceof Set) return copyCollection(source, record);
    if (!isPlainContainer(source)) return copyOpaque(source, record);

    const working = emptyContainer(source);
    const before = record ? emptyContainer(source) : undefined;
    const pair = { working, before };
    copies.set(source, pair);
    if (parentStamps?.has(source)) privateStamps!.add(working);
    for (const key of enumerableKeys(source)) {
      const value = (source as Record<PropertyKey, unknown>)[key];
      if (value !== null && (typeof value === 'object' || typeof value === 'function')) {
        const child = copy(value, record);
        writeField(working, key, child.working);
        if (before) writeField(before, key, child.before);
      } else {
        writeField(working, key, value);
        if (before) writeField(before, key, value);
      }
    }
    return pair;
  }
  function copyCollection(source: Map<unknown, unknown> | Set<unknown>, record: boolean): CopyPair {
    const create = () => (source instanceof Map ? new Map() : new Set());
    const working = create(),
      before = record ? create() : undefined;
    const pair = { working, before };
    copies.set(source, pair);
    for (const [key, value] of source.entries()) {
      const item = copy(value, record);
      if (working instanceof Map) {
        const id = copy(key, record);
        working.set(id.working, item.working);
        if (before instanceof Map) before.set(id.before, item.before);
      } else {
        working.add(item.working);
        if (before instanceof Set) before.add(item.before);
      }
    }
    return pair;
  }

  function copyOpaque(source: any, record: boolean): CopyPair {
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
      ? copy(detached, record)
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
