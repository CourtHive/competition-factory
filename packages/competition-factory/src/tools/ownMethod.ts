/**
 * The function registered under `name` on `source` itself, or undefined.
 *
 * WHY: method names arrive from callers (`executionQueue` directives, `invoke({ method })`, a `drawType`), and a plain
 * lookup also finds what every object inherits. On 7.47.0-dev, `executionQueue([{ method: 'constructor' }])`
 * dispatched to `Object()`, which returned the augmented params, tournament records included; `valueOf`,
 * `hasOwnProperty` and `__defineGetter__` threw uncaught (CodeQL #234, #235, #81).
 */
export type RegisteredMethod = (...args: unknown[]) => unknown;

/** `T` names the registry's function type where the caller knows it (a generator table); engines take the default. */
export function ownMethod<T = RegisteredMethod>(source: unknown, name: unknown): T | undefined {
  if (!source || typeof name !== 'string' || !Object.hasOwn(source as object, name)) return undefined;
  const candidate = (source as Record<string, unknown>)[name];
  return typeof candidate === 'function' ? (candidate as T) : undefined;
}
