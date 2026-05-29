/**
 * Suggestions registry — code → suggestion-factory.
 *
 * Each entry is a function that receives the error's `context` payload and
 * returns an array of actionable next-step strings. Resolution is lazy: the
 * `FactoryError.suggestions` getter only invokes the factory when the
 * getter is read, so production paths that never inspect suggestions pay
 * zero cost.
 *
 * v1 ships empty for every code. Populate incrementally as the catch-side
 * UX warrants — TMX toasts, CFS error responses, ingest pipeline retries.
 * Example entries we'd expect to add early:
 *
 *   ERR_INVALID_DRAW_SIZE  (ctx.drawSize)  ->
 *     ["Try drawSize 32 or 64 (the nearest powers of two).",
 *      "Or set policy `allowNonPowerOfTwo` to permit non-power-of-two."]
 *
 *   ERR_MISSING_TOURNAMENT  ->
 *     ["Call setState({ tournamentRecord }) before this method,",
 *      "or pass tournamentRecord directly in the params."]
 */

type SuggestionFactory = (context?: Record<string, any>) => string[];

const registry = new Map<string, SuggestionFactory>();

export function registerSuggestions(code: string, factory: SuggestionFactory): void {
  registry.set(code, factory);
}

export function getSuggestions(code: string, context?: Record<string, any>): string[] {
  const factory = registry.get(code);
  if (!factory) return [];
  try {
    return factory(context) ?? [];
  } catch {
    // A suggestion factory throwing must never break error propagation —
    // the consumer reading `.suggestions` is already handling an error.
    return [];
  }
}
