/**
 * `FactoryError` — base class for the rich error hierarchy.
 *
 * Replaces the legacy `{ message, code, info? }` POJO envelope with a real
 * Error subclass that carries:
 *   - `code`: the machine-readable identifier (same string the legacy
 *     constants used: `'ERR_MISSING_TOURNAMENT'`, `'INVALID_VALUES'`, etc.)
 *   - `cause`: the native ES2022 `Error.cause` chain (the underlying error
 *     that triggered this one, when wrapping)
 *   - `methodName`: the engine method name where this surfaced, populated
 *     by the engine's invoke layer when known
 *   - `path`: machine-readable JSON-path-like locator into the record
 *     (e.g. `events[2].drawDefinitions[0]`)
 *   - `context`: arbitrary structured payload from the call site
 *   - `info`: human-readable contextual string (preserved from legacy shape)
 *   - `suggestions`: lazy-resolved actionable next-step strings, looked up
 *     against the suggestions registry by code+context
 *
 * Backwards compatibility: `toJSON()` serializes to the legacy `{ message,
 * code, info? }` shape so existing consumers that read `result.error.code`
 * or `result.error.message` continue to work whether `error` is a POJO or a
 * `FactoryError` instance.
 *
 * Throwing vs. returning: methods may continue to return `{ error: <code
 * POJO> }` envelopes (the legacy pattern); consumers who want the typed
 * class can use the upcoming `unwrap()` helper, which inspects
 * `result.error.code` and throws the matching subclass from the registry.
 */
import { getSuggestions } from './suggestions';

export type FactoryErrorOptions = {
  cause?: unknown;
  methodName?: string;
  path?: string;
  context?: Record<string, any>;
  info?: string;
};

export class FactoryError extends Error {
  readonly code: string;
  readonly methodName?: string;
  readonly path?: string;
  readonly context?: Record<string, any>;
  readonly info?: string;

  constructor(code: string, message: string, opts?: FactoryErrorOptions) {
    // ES2022 native cause chain — preserved across re-throws so the original
    // failure stays reachable via `.cause`.
    super(message, opts?.cause !== undefined ? { cause: opts.cause } : undefined);
    // Subclass-correct name for `console.log`, devtools, and `e.name ===` checks
    this.name = this.constructor.name;
    this.code = code;
    if (opts?.methodName !== undefined) this.methodName = opts.methodName;
    if (opts?.path !== undefined) this.path = opts.path;
    if (opts?.context !== undefined) this.context = opts.context;
    if (opts?.info !== undefined) this.info = opts.info;
  }

  /**
   * Lazily-resolved actionable suggestions. Looked up against the
   * suggestions registry by code; the registry consults `this.context` for
   * code-specific hints (e.g. INVALID_DRAW_SIZE suggesting nearest powers
   * of two). Empty array when no suggestion source is registered.
   */
  get suggestions(): string[] {
    return getSuggestions(this.code, this.context);
  }

  /**
   * Serializes to the legacy `{ message, code, info? }` shape so existing
   * consumers reading `result.error.code` or `JSON.stringify(result)` get
   * the same bytes whether `error` is a POJO or a `FactoryError`.
   *
   * The rich fields (`cause`, `methodName`, `path`, `context`,
   * `suggestions`) are deliberately omitted from the JSON projection —
   * consumers that want them work with the instance directly.
   */
  toJSON(): { message: string; code: string; info?: string } {
    return {
      message: this.message,
      code: this.code,
      ...(this.info !== undefined ? { info: this.info } : {}),
    };
  }
}
