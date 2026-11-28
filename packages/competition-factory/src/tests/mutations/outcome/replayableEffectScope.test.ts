import { deferredQuery, deferredQueryBinding } from '@Mutate/notifications/drawNotifications';
import { replayableEffectScope } from '@Mutate/matchUps/outcome/effectScope';
import { getNoticeState } from '@Global/state/globalState';
import { originalNoticeValue } from '@Global/state/noticePayloadAudit';
import { describe, expect, it } from 'vitest';

/**
 * A CLOCK-FREE CALL IS OWNED ONLY OVER A REPLAYABLE SCOPE (`effectScope.ts`). The predicate replaced a private deep
 * copy of the call's arguments, phases and buffered notices, made only to learn whether it could be made: the call
 * abstained `clock` exactly where the copy threw. `copies` below is that copy, kept here as the reference, and the
 * predicate must answer as it did on every kind of value either one treats specially.
 */
function copies(root: unknown): boolean {
  const done = new Map<object, object>();
  const clone = (value: unknown): unknown => {
    if (__NOTICE_PAYLOAD_DIAGNOSTICS__) value = originalNoticeValue(value);
    if (!value || (typeof value !== 'object' && typeof value !== 'function')) return value;
    if (done.has(value)) return done.get(value);
    if (typeof value === 'function') {
      const binding = deferredQueryBinding(value);
      if (!binding) {
        done.set(value, value);
        return value;
      }
      const copy = deferredQuery(binding.query, undefined);
      done.set(value, copy);
      deferredQueryBinding(copy)!.args = clone(binding.args);
      return copy;
    }
    const prototype = Object.getPrototypeOf(value);
    if (
      (value instanceof Date && prototype !== Date.prototype) ||
      (value instanceof Set && prototype !== Set.prototype) ||
      (value instanceof Map && prototype !== Map.prototype)
    )
      throw new Error('opaque temporal replay subtype');
    let copy: object;
    if (value instanceof Date) copy = new Date(Date.prototype.getTime.call(value));
    else if (value instanceof Set) copy = new Set();
    else if (value instanceof Map) copy = new Map();
    else if (Array.isArray(value)) copy = [];
    else if (prototype === Object.prototype || prototype === null) copy = Object.create(prototype);
    else throw new Error('opaque temporal replay value');
    done.set(value, copy);
    if (value instanceof Set)
      for (const item of Set.prototype.values.call(value)) (copy as Set<unknown>).add(clone(item));
    if (value instanceof Map)
      for (const [key, item] of Map.prototype.entries.call(value))
        (copy as Map<unknown, unknown>).set(clone(key), clone(item));
    for (const key of Reflect.ownKeys(value)) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key)!;
      if (!('value' in descriptor)) throw new Error('accessor in temporal replay value');
      Object.defineProperty(copy, key, { ...descriptor, value: clone(descriptor.value) });
    }
    return copy;
  };
  try {
    clone(root);
    return true;
  } catch {
    return false;
  }
}

class Instance {
  value = 1;
}
class OwnDate extends Date {}
class OwnSet extends Set {}
class OwnMap extends Map {}
const cyclic: Record<string, unknown> = { name: 'cycle' };
cyclic.self = cyclic;
const accessor = Object.defineProperty({}, 'computed', { get: () => 1, enumerable: true });

const VALUES: [string, unknown, boolean][] = [
  ['primitives', { n: 1, s: 's', b: false, u: undefined, z: null, big: 1n, sym: Symbol('s') }, true],
  // eslint-disable-next-line no-sparse-arrays -- a hole is one of the shapes the copy handled
  ['an array, sparse', [1, , 3], true],
  ['a null-prototype object', Object.assign(Object.create(null), { a: 1 }), true],
  ['a Date', new Date(0), true],
  ['a Set and a Map of plain values', { set: new Set([1, { a: 1 }]), map: new Map([[{ k: 1 }, [2]]]) }, true],
  ['a cycle', cyclic, true],
  ['a plain function', { fn: () => 1 }, true],
  ['a deferred query over plain arguments', { read: deferredQuery((a: any) => a, { a: 1 }) }, true],
  ['a deferred query over an instance', { read: deferredQuery((a: any) => a, new Instance()) }, false],
  ['a class instance', { nested: [new Instance()] }, false],
  ['a Date subclass', new OwnDate(0), false],
  ['a Set subclass', new OwnSet(), false],
  ['a Map subclass', new OwnMap(), false],
  ['a Set holding an instance', new Set([new Instance()]), false],
  ['a Map keyed by an instance', new Map([[new Instance(), 1]]), false],
  ['an accessor', { deep: accessor }, false],
  ['a symbol-keyed accessor', Object.defineProperty({}, Symbol('k'), { get: () => 1 }), false],
];

describe('replayableEffectScope answers as the copy it replaced', () => {
  const drawDefinition = { drawId: 'd' } as any;
  it('has notice state to replay into, in the suite', () => {
    expect(getNoticeState()).toBeDefined();
  });

  it.each(VALUES)('%s', (_label, value, plain) => {
    const args = { drawDefinition, request: { value } } as any;
    const phases = { value } as any;
    const notices = getNoticeState()?.notices;
    expect(copies({ args, phases, notices })).toBe(plain);
    expect(replayableEffectScope(args, phases)).toBe(plain);
  });

  it('abstains with no draw', () => {
    expect(replayableEffectScope({ request: {} } as any, {} as any)).toBe(false);
  });
});
