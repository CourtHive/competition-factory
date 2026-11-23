import ratingsParameters from '@Fixtures/ratings/ratingsParameters';

/**
 * The single place a scale value is turned into a number.
 *
 * Before this existed there were eight independent implementations across the
 * factory, TMX and courthive-components, and they disagreed in ways that
 * produced silent, wrong output rather than errors. Two failure modes recurred,
 * and every clause below exists to prevent one of them:
 *
 * **1. Rejecting real ratings.** Ingested records store scale values as
 * STRINGS — verified against production: `{ utrRating: '12.48' }`. mocksEngine
 * emits numbers, so a `typeof x === 'number'` gate passes every synthetic test
 * and silently drops every real rating.
 *
 * **2. Inventing a rating from nothing.** The same records carry
 * `{ utrRating: '' }` for a player with no rating on that scale. `Number('')`
 * is `0`, and `0` on UTR's declared `[1, 16]` range is a full unit below the
 * floor — the strongest or weakest player in the field, fabricated from an
 * empty string. So coercion goes through `Number.parseFloat` with an explicit
 * NaN guard, never `Number()`, `+value` or `parseInt`.
 *
 * And one rule that is easy to miss in both directions:
 *
 * **3. `0` is a legitimate rating.** `PSA [0,3000]`, `SQUASH_LEVELS [0,7000]`,
 * `ITTF [0,20000]` and `BWF [0,150000]` all declare zero inside their valid
 * range — a new player really is on zero points. Any truthiness test (`if
 * (value)`, `value || fallback`, `!Number.parseFloat(value)`) therefore erases
 * a real competitor. Callers that need "is a value present" must ask for
 * `undefined`, not falsiness.
 *
 * Returns `undefined` — never a fallback — when no number can be resolved.
 * Choosing a default is the caller's decision and belongs at the call site
 * where the consequences are visible.
 */

type ResolveScaleValueParams = {
  /** Explicit accessor, e.g. 'utrRating'. Wins over the scaleName lookup. */
  accessor?: string;
  /** Scale name, used to look the accessor up in `ratingsParameters`. */
  scaleName?: string;
};

/** Coerce a primitive to a number without ever mapping '' or null to 0. */
function primitiveToNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string') return undefined;
  if (!value.trim()) return undefined;
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : undefined;
}

function accessorsFor({ accessor, scaleName }: ResolveScaleValueParams): string[] {
  const params = scaleName ? ratingsParameters[scaleName] : undefined;
  const candidates = [accessor, params?.accessor, ...(params?.accessors ?? [])];
  return candidates.filter((candidate): candidate is string => typeof candidate === 'string' && !!candidate);
}

/**
 * Resolve a scaleValue to a number, or `undefined` when there isn't one.
 *
 * Accepts a primitive (`12.48`, `'12.48'`) or an accessor-keyed object
 * (`{ utrRating: '12.48' }`, `{ duprRating: 4.5, reliabilityScore: 80 }`).
 * For objects the accessor is resolved in order: the explicit `accessor`
 * argument, then the scale's declared `accessor`/`accessors` from
 * `ratingsParameters`, and only then the first property that yields a number.
 * That last fallback is a convenience for unknown scales; prefer passing
 * `scaleName` so a multi-property scale (WTN carries both `wtnRating` and
 * `confidence`) cannot resolve to the wrong field.
 */
export function resolveScaleValueNumber(scaleValue: unknown, params: ResolveScaleValueParams = {}): number | undefined {
  const primitive = primitiveToNumber(scaleValue);
  if (primitive !== undefined) return primitive;
  if (!scaleValue || typeof scaleValue !== 'object') return undefined;

  const source = scaleValue as Record<string, unknown>;
  for (const accessor of accessorsFor(params)) {
    const resolved = primitiveToNumber(source[accessor]);
    if (resolved !== undefined) return resolved;
  }

  // Unknown scale shape: take the first property that resolves. Arrays are not
  // a scale value shape and are excluded so an index never reads as a rating.
  if (Array.isArray(scaleValue)) return undefined;
  for (const value of Object.values(source)) {
    const resolved = primitiveToNumber(value);
    if (resolved !== undefined) return resolved;
  }
  return undefined;
}

/**
 * Whether a scale value carries a usable number.
 *
 * Use this instead of truthiness so a legitimate `0` is not mistaken for a
 * missing rating — see rule 3 above.
 */
export function hasScaleValueNumber(scaleValue: unknown, params: ResolveScaleValueParams = {}): boolean {
  return resolveScaleValueNumber(scaleValue, params) !== undefined;
}
