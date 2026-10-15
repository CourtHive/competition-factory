import { isObject } from '@Tools/objects';

/**
 * A rollback/preview snapshot, kept apart from `makeDeepCopy` on purpose.
 *
 * `makeDeepCopy` produces OUTWARD copies, and its configuration (`ignore`, `toJSON`, `stringify`,
 * `threshold`) exists so that records loaded from a document database, which can carry
 * driver-internal objects the walk cannot copy, still yield a usable copy. That configuration is
 * right for a projection and wrong for a snapshot: it dropped ignored keys from the live record on
 * restore, stringified values, and past a threshold shared mutable objects with the live state,
 * which made a rollback silently incomplete.
 *
 * Here:
 * - plain objects and arrays are ALWAYS copied, whatever the configuration says, because a plain
 *   object is copyable by definition and may be mutated by the operation;
 * - every other value (a class instance such as a driver's identifier or decimal type, a Date, a
 *   function) is kept BY REFERENCE, under a documented assumption: the factory never writes into a
 *   value whose shape it does not know. A Date is copied, being mutable and cheap to copy;
 * - `null` stays `null`;
 * - each copy maps back to its ORIGINAL object, so a restore can reinstate the original objects,
 *   including ones the operation replaced or removed, rather than writing into whatever object now
 *   occupies a path. Shared references stay shared, and a cycle cannot recurse forever.
 */
export type StateClone<T> = {
  copy: T;
  originals: WeakMap<object, object>;
};

export function isPlainContainer(value: unknown): value is object {
  if (Array.isArray(value)) return true;
  if (!isObject(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null;
}

export function cloneState<T>(source: T): StateClone<T> {
  const originals = new WeakMap<object, object>();
  const copies = new Map<object, object>();

  const clone = (value: unknown): unknown => {
    if (value instanceof Date) {
      const date = new Date(value.getTime());
      originals.set(date, value);
      return date;
    }
    if (!isPlainContainer(value)) return value;

    const existing = copies.get(value);
    if (existing) return existing;

    const copy: Indexable = Array.isArray(value) ? (new Array(value.length) as unknown as Indexable) : {};
    copies.set(value, copy);
    originals.set(copy, value);
    for (const key of Object.keys(value)) copy[key] = clone((value as Indexable)[key]);
    return copy;
  };

  return { copy: clone(source) as T, originals };
}

/**
 * Writes a snapshot back INTO the original objects, so that every object present at capture keeps
 * its identity and regains its values; objects the operation created are dropped. Used when the
 * engine works on the caller's own objects (deep copy disabled), where replacing them would leave
 * the caller holding the operation's writes while the engine moved on to a copy.
 *
 * Returns the original to install at the root.
 */
export function restoreState<T>({ copy, originals }: StateClone<T>): T {
  const restored = new Set<object>();

  const reinstate = (snapshotValue: unknown): unknown => {
    if (snapshotValue instanceof Date) {
      const originalDate = originals.get(snapshotValue) as Date | undefined;
      originalDate?.setTime(snapshotValue.getTime());
      return originalDate ?? snapshotValue;
    }
    if (!isPlainContainer(snapshotValue)) return snapshotValue;
    const original = originals.get(snapshotValue) as Indexable | undefined;
    if (!original) return snapshotValue; // not from this capture: install the snapshot's own copy
    if (restored.has(original)) return original;
    restored.add(original);

    const snapshot = snapshotValue as Indexable;
    if (Array.isArray(snapshot) && Array.isArray(original)) {
      original.length = snapshot.length;
      snapshot.forEach((value, index) => assignIfChanged(original, String(index), reinstate(value)));
    } else {
      for (const key of Object.keys(original)) if (!(key in snapshot)) delete original[key];
      for (const key of Object.keys(snapshot)) assignIfChanged(original, key, reinstate(snapshot[key]));
    }
    return original;
  };

  return reinstate(copy) as T;
}

type Indexable = Record<string, unknown>;

function assignIfChanged(target: Indexable, key: string, value: unknown) {
  if (target[key] !== value) target[key] = value;
}
