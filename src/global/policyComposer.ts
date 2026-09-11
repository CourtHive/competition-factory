/**
 * `policyComposer` — fluent merger for `PolicyDefinition` shapes.
 *
 * Kills the nested-spread hell that shows up wherever a consumer
 * needs to express a federation override of a stock policy. Without
 * the composer, expressing "USTA seeding but with CLUSTER positioning
 * and a custom drawSize=64 threshold" requires either:
 *
 *   - Copying the entire stock policy and editing the few changed
 *     fields by hand (the dominant pattern today — see
 *     `TMX/src/components/drawers/addDraw/submitDrawParams.ts`'s
 *     `POLICY_SEEDING_DEFAULT` vs `POLICY_SEEDING_ITF`, two ~25-line
 *     objects that differ in three fields).
 *   - Hand-merging via spreads, which silently flattens deeper nested
 *     objects unless every level is spread independently
 *     (`{...base, seedingProfile: {...base.seedingProfile, ...}}`).
 *     Adding a new nested field means re-deriving every spread chain.
 *
 * With the composer:
 *
 *   const fed = policyComposer(POLICY_TYPE_SEEDING)
 *     .extend(POLICY_SEEDING_USTA_DEFAULT)
 *     .set('policyName', 'CTS SEEDING')
 *     .set('seedingProfile.positioning', CLUSTER)
 *     .build();
 *
 * Or, registering at the same time:
 *
 *   policyComposer(POLICY_TYPE_SEEDING)
 *     .extend(stock)
 *     .set('seedingProfile.positioning', CLUSTER)
 *     .register({ name: 'CTS_SEEDING', version: '2026' });
 *
 * ### Contract
 *
 * - **Immutable.** Every method returns a NEW composer; nothing mutates
 *   the previous instance or the inputs. Safe to share a base composer
 *   across multiple federation overrides.
 * - **Scoped to one `policyType`.** Passed at construction; `extend`,
 *   `from`, and `build` wrap/unwrap the `{[policyType]: ...}` envelope
 *   transparently. Pass `extend()` either the wrapped or raw form —
 *   the composer detects which.
 * - **Dot-path access.** `seedingProfile.positioning`, `drawTypes.ROUND_ROBIN.positioning`,
 *   numeric segments for arrays (`seedsCountThresholds.0.seedsCount`).
 *   Same path syntax across `set` / `merge` / `unset` / `get`.
 * - **Arrays replace by default** (matches `deepMerge`). Opt in to
 *   merge with `mergeArrays(path)` — for now the registry's
 *   `seedsCountThresholds`-style "merge by drawSize key" lives in the
 *   consumer; composer's primitive is "deep merge with array replace".
 */

import { policyRegistry, PolicyDefinition } from './policyRegistry';
import { deepMerge } from '@Tools/deepMerge';

/**
 * Split a dot-path into segments. Numeric segments are kept as strings;
 * array vs. object indexing is decided at apply time based on the
 * surrounding container type. Empty path returns `[]`.
 */
function splitPath(path: string): string[] {
  if (!path) return [];
  return path.split('.');
}

/**
 * Read at a dot-path. Returns `undefined` when any segment in the chain
 * doesn't exist; never throws on missing intermediate nodes.
 */
function getAtPath(obj: unknown, path: string): unknown {
  if (obj === null || obj === undefined) return undefined;
  const segments = splitPath(path);
  let cursor: any = obj;
  for (const segment of segments) {
    if (cursor === null || cursor === undefined) return undefined;
    cursor = cursor[segment];
  }
  return cursor;
}

/**
 * Return a new object/array with `value` set at `path`. Walks the path
 * creating intermediate objects (or arrays, when the next segment parses
 * as a non-negative integer) as needed. Never mutates the input.
 */
function setAtPath(obj: Record<string, any>, path: string, value: unknown): Record<string, any> {
  const segments = splitPath(path);
  if (!segments.length) return obj;
  return setRecursive(obj, segments, 0, value);
}

function setRecursive(node: any, segments: string[], depth: number, value: unknown): any {
  const segment = segments[depth];
  const isLast = depth === segments.length - 1;
  const childKey = segments[depth + 1];
  const childIsNumeric = childKey !== undefined && /^\d+$/.test(childKey);
  const existing = node && typeof node === 'object' ? node[segment] : undefined;
  const child = isLast ? value : setRecursive(existing ?? (childIsNumeric ? [] : {}), segments, depth + 1, value);
  if (Array.isArray(node)) {
    const copy = node.slice();
    copy[Number(segment)] = child;
    return copy;
  }
  return { ...(node ?? {}), [segment]: child };
}

/**
 * Return a new object with the value at `path` removed. Walks the path
 * up to the parent and deletes the leaf key; intermediates that became
 * empty are NOT pruned (callers shouldn't depend on that — but a "set
 * nothing" intent should use `set(path, undefined)` if they want the
 * key kept; `unset` removes the key entirely).
 */
function unsetAtPath(obj: Record<string, any>, path: string): Record<string, any> {
  const segments = splitPath(path);
  if (!segments.length) return obj;
  return unsetRecursive(obj, segments, 0);
}

function unsetRecursive(node: any, segments: string[], depth: number): any {
  const segment = segments[depth];
  if (depth === segments.length - 1) {
    if (Array.isArray(node)) {
      const copy = node.slice();
      copy.splice(Number(segment), 1);
      return copy;
    }
    const copy = { ...(node ?? {}) };
    delete copy[segment];
    return copy;
  }
  const child = node?.[segment];
  if (child === undefined) return node;
  const updatedChild = unsetRecursive(child, segments, depth + 1);
  if (Array.isArray(node)) {
    const copy = node.slice();
    copy[Number(segment)] = updatedChild;
    return copy;
  }
  return { ...(node ?? {}), [segment]: updatedChild };
}

/**
 * Internal composer state. Held in a private closure variable; never
 * exposed directly because mutation through the API is intentionally
 * forbidden.
 */
type ComposerState = {
  policyType: string | undefined;
  definition: PolicyDefinition;
};

export interface PolicyComposer {
  /**
   * Return the current value at `path`. Reads do not mutate; helpful
   * for asserting on intermediate state in tests or for chaining
   * "modify based on current value" — wrap the result and pipe back
   * through `set`.
   */
  get(path: string): unknown;

  /**
   * Deep-merge another policy onto the current state. Accepts either
   * the wrapped form (`{[policyType]: ...}`) or the raw inner shape;
   * the composer detects which by checking whether the supplied object
   * contains a `[policyType]` key. Arrays replace (no concat / dedupe);
   * use `mergeArrays(path)` for opt-in array merging.
   */
  extend(other: Record<string, any>): PolicyComposer;

  /**
   * Replace the value at `path` with `value`. Walks intermediate
   * objects, creating them as plain objects (or arrays, if the next
   * segment parses as a non-negative integer) when missing.
   */
  set(path: string, value: unknown): PolicyComposer;

  /**
   * Deep-merge `fragment` at `path`. Equivalent to `set(path,
   * deepMerge(get(path), fragment))` but spelled as one call.
   */
  merge(path: string, fragment: Record<string, any>): PolicyComposer;

  /**
   * Remove the key at `path`. Walks to the parent and deletes the leaf;
   * array elements are spliced out (shifting subsequent indices).
   */
  unset(path: string): PolicyComposer;

  /**
   * Start from a named registry entry. Loads `policyRegistry.lookup({
   * policyType, name, version })` and uses the result as the new
   * accumulator. Throws if the lookup misses, so a typo in the
   * federation name surfaces immediately rather than silently giving
   * an empty composer.
   */
  from(args: { name: string; version?: string }): PolicyComposer;

  /**
   * Finalize. Returns `{ [policyType]: definition }` when the composer
   * was constructed with a `policyType`; returns the raw `definition`
   * when there's no wrapping.
   */
  build(): Record<string, any>;

  /**
   * Build AND register into `policyRegistry`. The returned value is
   * the same shape `build()` returns — handy for inline assignment to
   * a method's `policyDefinitions:` param at the same time as
   * registering the entry for later lookup elsewhere.
   */
  register(args: { name: string; version?: string }): Record<string, any>;
}

/**
 * Construct a composer scoped (optionally) to a single `policyType`.
 * Omit `policyType` to compose a raw definition without the policy-type
 * envelope — useful when assembling a fragment that will be merged into
 * a larger structure later.
 */
export function policyComposer(policyType?: string): PolicyComposer {
  return composerFromState({ policyType, definition: {} });
}

/**
 * Detect whether `value` is already wrapped as `{[policyType]: ...}`.
 * The composer accepts both forms in `extend`/`from`; this helper
 * routes them to the right unwrap path.
 */
function isWrapped(value: Record<string, any>, policyType: string | undefined): boolean {
  if (!policyType) return false;
  if (!value || typeof value !== 'object') return false;
  return Object.prototype.hasOwnProperty.call(value, policyType);
}

function unwrap(value: Record<string, any>, policyType: string | undefined): PolicyDefinition {
  if (!policyType) return value ?? {};
  if (isWrapped(value, policyType)) return value[policyType] ?? {};
  return value ?? {};
}

function wrap(definition: PolicyDefinition, policyType: string | undefined): Record<string, any> {
  if (!policyType) return definition;
  return { [policyType]: definition };
}

function composerFromState(state: ComposerState): PolicyComposer {
  const { policyType, definition } = state;

  return {
    get(path: string): unknown {
      return getAtPath(definition, path);
    },

    extend(other: Record<string, any>): PolicyComposer {
      const incoming = unwrap(other, policyType);
      const merged = deepMerge(definition, incoming) as PolicyDefinition;
      return composerFromState({ policyType, definition: merged });
    },

    set(path: string, value: unknown): PolicyComposer {
      const next = setAtPath(definition, path, value);
      return composerFromState({ policyType, definition: next });
    },

    merge(path: string, fragment: Record<string, any>): PolicyComposer {
      const current = getAtPath(definition, path);
      const merged = current && typeof current === 'object' ? deepMerge(current, fragment) : fragment;
      const next = setAtPath(definition, path, merged);
      return composerFromState({ policyType, definition: next });
    },

    unset(path: string): PolicyComposer {
      const next = unsetAtPath(definition, path);
      return composerFromState({ policyType, definition: next });
    },

    from({ name, version }: { name: string; version?: string }): PolicyComposer {
      if (!policyType) {
        throw new Error('policyComposer.from() requires the composer to be scoped to a policyType');
      }
      const looked = policyRegistry.lookup({ policyType, name, version });
      if (!looked) {
        const v = version ? ` version ${version}` : '';
        throw new Error(`policyComposer.from(): no registry entry for ${policyType}::${name}${v}`);
      }
      return composerFromState({ policyType, definition: looked });
    },

    build(): Record<string, any> {
      return wrap(definition, policyType);
    },

    register({ name, version }: { name: string; version?: string }): Record<string, any> {
      if (!policyType) {
        throw new Error('policyComposer.register() requires the composer to be scoped to a policyType');
      }
      policyRegistry.register({ policyType, name, version, definition });
      return wrap(definition, policyType);
    },
  };
}
