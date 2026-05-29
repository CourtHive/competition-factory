/**
 * `unwrap(result)` — turn a factory result envelope into either its success
 * payload or a thrown `FactoryError` subclass.
 *
 * Companion to `engine.q.*` (#2): where `q.*` does silent fallback (returns
 * `[]` or `undefined` when a query errors), `unwrap()` makes errors LOUD —
 * lifting the legacy `{ error: { code, message, info? } }` envelope into a
 * typed exception that catch sites can pattern-match via `instanceof`.
 *
 *   const { events } = unwrap(engine.getEvents());
 *   // throws InvalidValuesError / MissingTournamentRecordError / ...
 *   // returns the success-branch payload otherwise
 *
 *   try {
 *     const { drawDefinition } = unwrap(engine.getEvent({ eventId }));
 *   } catch (e) {
 *     if (e instanceof EventNotFoundError) {
 *       showToast(e.message, { suggestions: e.suggestions });
 *     } else throw e;
 *   }
 *
 * Backwards compatibility: accepts both shapes of `result.error` — the
 * legacy POJO (`{ code, message, info? }`) AND a pre-thrown `FactoryError`
 * instance. Legacy POJOs are upgraded to the matching subclass via the code
 * registry (`constructFactoryError`); already-typed errors are re-thrown
 * unchanged so the originating class + cause chain are preserved.
 */
import { FactoryError } from '../errors/FactoryError';
import { constructFactoryError } from '../errors/codeRegistry';

/**
 * Type-level: strip `error` from the result so callers see the success-branch
 * shape after unwrap. `success` is left in place — some methods carry both
 * `success` and a payload, and consumers occasionally inspect it.
 */
export type Unwrap<T> = T extends { error?: any } ? Omit<T, 'error'> : T;

/**
 * Heuristic for "the result envelope reports an error". Accepts both the
 * legacy POJO shape and a `FactoryError` instance. Empty/undefined `error`
 * fields are treated as success.
 */
function hasError(
  value: unknown,
): value is { error: FactoryError | { code?: string; message?: string; info?: string } } {
  return !!(value && typeof value === 'object' && 'error' in value && (value as { error?: unknown }).error);
}

export function unwrap<T>(result: T, opts?: { methodName?: string }): Unwrap<T> {
  if (result === undefined || result === null) {
    // Method returned nothing — typically means the engine call itself
    // didn't dispatch (unknown method, no state loaded, paramsMiddleware
    // bailed). Surface that as a typed error rather than letting the
    // caller dereference null/undefined.
    throw new FactoryError('ENGINE_RETURNED_UNDEFINED', 'engine returned no result', {
      methodName: opts?.methodName,
    });
  }

  if (hasError(result)) {
    const err = result.error;

    // Already a typed instance — re-throw as-is to preserve the originating
    // subclass + native cause chain. Caller's `instanceof` checks see the
    // same class the producer threw.
    if (err instanceof FactoryError) throw err;

    // Legacy POJO. Upgrade to the matching subclass from the registry; fall
    // back to base `FactoryError` for unregistered codes. `info` is
    // preserved on the new instance so consumers reading `e.info` see the
    // same string they would have seen on the POJO.
    const code = (err as { code?: string }).code ?? 'UNKNOWN_ERROR';
    const message = (err as { message?: string }).message ?? 'Unknown error returned by engine';
    throw constructFactoryError(code, message, {
      info: (err as { info?: string }).info,
      methodName: opts?.methodName,
    });
  }

  return result as Unwrap<T>;
}
