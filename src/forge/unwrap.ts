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
 * Type-level: narrow to the success arm.
 *
 * For discriminated unions like `{ error: ErrorType } | { success, payload }`
 * — the dominant shape across factory methods — `Exclude` drops any arm
 * whose `error` is a real ErrorType (i.e. required, not optional). Single-
 * shape returns with `error?: ErrorType` (optional) are NOT discriminated,
 * so the arm survives unchanged and callers can still destructure the
 * (now-known-absent) payload.
 *
 * The detector matches `{ error: { code: string } }` rather than the full
 * ErrorType so it tolerates minor shape drift (extra/different info keys).
 */
export type Unwrap<T> = Exclude<T, { error: { code: string } }>;

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

/**
 * `unwrapOr(result, fallback)` — silent-fallback companion to `unwrap()`.
 *
 * Same envelope checks (legacy POJO error, `FactoryError` instance, or
 * `null`/`undefined` result) — but returns `fallback` instead of throwing.
 * Picks up where `engine.q.*` stops: `q.*` is curated to the highest-fan-in
 * queries with sensible empty defaults; `unwrapOr` works on any method's
 * result and lets the caller name the fallback inline.
 *
 *   const { courtIssues, rowIssues } = unwrapOr(
 *     engine.proConflicts({ matchUps }),
 *     { courtIssues: {}, rowIssues: {} },
 *   );
 *
 *   // Or with `null` to express "skip on error":
 *   const result = unwrapOr(engine.proConflicts({ matchUps }), null);
 *   if (!result) return;
 *
 * Intentionally silent — no logging, no toast, no `console.warn`. The
 * caller chose silent fallback; if they want to surface the error they
 * use `unwrap()` with their own catch instead. Keeps the two helpers'
 * contracts crisp: `unwrap` = loud, `unwrapOr` = silent.
 */
export function unwrapOr<T, F>(result: T, fallback: F): Unwrap<T> | F {
  if (result === undefined || result === null) return fallback;
  if (hasError(result)) return fallback;
  return result as Unwrap<T>;
}
