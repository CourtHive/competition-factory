/**
 * The prototype of an {@link idRecord}: empty, frozen and itself without a prototype, so nothing is inherited through
 * it. Unlike `Object.create(null)`, which V8 builds in dictionary mode, an object created from it keeps a fast shape.
 */
const NO_INHERITANCE: object = Object.freeze(Object.create(null));

/**
 * A map keyed by ids that come from records or payloads. Nothing is inherited: an id of "__proto__" is an ordinary own
 * key rather than a write through to Object.prototype, and ids such as "constructor" or "toString" read as absent
 * (CodeQL #211, #241, #249, 2026-11-23). Hand it to callers with {@link plainRecord}.
 */
export function idRecord<T = any>(): Record<string, T> {
  return Object.create(NO_INHERITANCE);
}

/**
 * Hands a map built with {@link idRecord} or `Object.create(null)` to callers as a plain object, in place.
 *
 * Callers expect plain objects: they compare, spread and copy results. Giving the map `Object.prototype` keeps every
 * own key, "__proto__" included, in its order, and copies nothing. It is the last step: from here on the map has the
 * inherited `__proto__` setter, so nothing may write ids into it after the hand-over.
 *
 * A map with any other prototype is copied into a fresh plain object, each key defined rather than assigned.
 */
export function plainRecord<M extends object | undefined>(map: M): M {
  if (!map) return map;
  const prototype = Object.getPrototypeOf(map);
  if (prototype === Object.prototype) return map;
  if (prototype === NO_INHERITANCE || prototype === null) return Object.setPrototypeOf(map, Object.prototype);
  const plain: Record<string, unknown> = {};
  for (const key of Object.keys(map))
    Object.defineProperty(plain, key, {
      value: (map as Record<string, unknown>)[key],
      enumerable: true,
      writable: true,
      configurable: true,
    });
  return plain as M;
}

/** Whether a map is still an {@link idRecord} or a null-prototype map, i.e. not yet handed over. */
export function isIdRecord(value: unknown): value is Record<string, any> {
  if (!value || typeof value !== 'object') return false;
  const prototype = Object.getPrototypeOf(value);
  return prototype === NO_INHERITANCE || prototype === null;
}

/**
 * The array a plain object holds under a key from a record, created when absent. For maps handed to callers as they
 * are built, so they keep `Object.prototype` and cannot be an {@link idRecord}: only an own key counts, so
 * "constructor" or "toString" read as absent rather than as a built-in, and "__proto__" is defined as an own key
 * rather than assigned through the inherited setter. Ordinary keys are assigned, in the same order as before.
 */
export function ownArray<T = any>(map: Record<string, T[]>, key: string): T[] {
  const existing = Object.hasOwn(map, key) ? map[key] : undefined;
  if (existing) return existing;
  const list: T[] = [];
  if (key === '__proto__')
    Object.defineProperty(map, key, { value: list, enumerable: true, writable: true, configurable: true });
  else map[key] = list;
  return list;
}
