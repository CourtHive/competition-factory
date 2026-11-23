/**
 * A plain-object copy of a map that was built with a null prototype, for returning to callers.
 *
 * Maps keyed by ids from records are built with `Object.create(null)`, so an id of "__proto__" is an ordinary key
 * rather than a write through to Object.prototype (CodeQL #211, #241, #249, 2026-11-23). Callers expect plain objects:
 * they compare, spread and copy results. Each key is defined rather than assigned, so even "__proto__" becomes an own
 * data property here instead of going through the inherited setter.
 */
export function plainRecord<M extends object | undefined>(map: M): M {
  if (!map) return map;
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
