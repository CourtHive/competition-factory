import {
  noticePayloadTestMode,
  originalNoticeValue,
  takeNoticePayloadViolations,
} from '@Global/state/noticePayloadAudit';
import { afterEach, expect } from 'vitest';

/**
 * Vitest setupFiles hook under NOTICE_PAYLOAD_WRITE_CHECK=1 (vitest.config.mts): every test runs with the read-only
 * notice payload detector on (CA ruling 27). A write through a payload throws where it happens. It is also recorded,
 * so a write whose throw was caught, or became a rejection nothing awaited, still fails the test here. A test that
 * makes writes on purpose takes them in its own afterEach, which runs before this one.
 */
noticePayloadTestMode.enabled = true;

afterEach(() => {
  const writes = takeNoticePayloadViolations();
  if (writes.length)
    throw new Error(`${writes.length} write(s) through a read-only notice payload:\n${writes.join('\n\n')}`);
});

/**
 * Deep equality (toEqual, toMatchObject and kin) compares what each view wraps, the value production delivers. A view
 * of a function or a Date is otherwise unequal to the function or Date itself. Identity (`toBe`) still distinguishes a
 * view from a raw reference; a test asserting that identity compares `originalNoticeValue(view)`.
 */
expect.addEqualityTesters([
  function viewsCompareAsTheirValues(a, b, testers) {
    const rawA = originalNoticeValue(a);
    const rawB = originalNoticeValue(b);
    if (Object.is(rawA, a) && Object.is(rawB, b)) return undefined;
    return this.equals(rawA, rawB, testers);
  },
]);

/**
 * Native `structuredClone` cannot clone a proxy, so a subscriber that copies its payload (a passive read) would fail
 * only because the detector is on. Under the audit the suite's clone copies what each view wraps, the value production
 * delivers, keeping aliases. Writes through the copy are the test's own.
 */
const CLONES_VIEWS = Symbol.for('factory.noticePayloadWriteCheck.structuredClone');
const nativeClone = globalThis.structuredClone as typeof structuredClone & { [CLONES_VIEWS]?: true };
if (!nativeClone[CLONES_VIEWS]) {
  const auditClone = (<T>(value: T, options?: Parameters<typeof structuredClone>[1]): T => {
    try {
      return nativeClone(originalNoticeValue(value), options);
    } catch (error) {
      if ((error as Error)?.name !== 'DataCloneError') throw error;
      return nativeClone(unwrapViews(value, new Map()), options) as T;
    }
  }) as typeof structuredClone & { [CLONES_VIEWS]?: true };
  auditClone[CLONES_VIEWS] = true;
  globalThis.structuredClone = auditClone;
}

// A copy of the containers a test assembled around views (an array of payloads, say), with each view replaced by its
// raw value; anything else is left for the native clone to accept or refuse.
function unwrapViews(value: unknown, seen: Map<object, unknown>): unknown {
  const raw = originalNoticeValue(value);
  if (raw === null || typeof raw !== 'object') return raw;
  if (seen.has(raw)) return seen.get(raw);
  if (Array.isArray(raw)) {
    const copy: unknown[] = [];
    seen.set(raw, copy);
    for (const item of raw) copy.push(unwrapViews(item, seen));
    return copy;
  }
  if (raw instanceof Map) {
    const copy = new Map();
    seen.set(raw, copy);
    for (const [k, v] of raw) copy.set(unwrapViews(k, seen), unwrapViews(v, seen));
    return copy;
  }
  if (raw instanceof Set) {
    const copy = new Set();
    seen.set(raw, copy);
    for (const item of raw) copy.add(unwrapViews(item, seen));
    return copy;
  }
  const proto = Object.getPrototypeOf(raw);
  if (proto !== Object.prototype && proto !== null) return raw;
  const copy: Record<string | symbol, unknown> = Object.create(proto);
  seen.set(raw, copy);
  for (const key of Object.keys(raw)) copy[key] = unwrapViews((raw as Record<string, unknown>)[key], seen);
  return copy;
}
