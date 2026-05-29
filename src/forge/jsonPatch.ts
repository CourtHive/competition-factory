/**
 * Minimal RFC 6902 JSON Patch generator — hand-rolled to keep the factory's
 * zero-runtime-deps posture. Used by `dryRun` (and downstream by `timeTravel`)
 * to express "what would change" between two state snapshots.
 *
 * Emits the three operations needed for a forward-only diff:
 *   - `add`     when a key/array index appears in `after` but not `before`
 *   - `remove`  when a key/index appears in `before` but not `after`
 *   - `replace` when a value at the same key/index differs
 *
 * Skipped intentionally:
 *   - `move` / `copy` — require quadratic value-equality search across the
 *     whole tree; the readability win for human consumers is small while the
 *     cost (and false-positive risk on common scalar values) is large
 *   - `test` — only meaningful for patch APPLICATION, not generation
 *
 * Paths follow RFC 6901 JSON Pointer syntax:
 *   - root is `""` (empty string)
 *   - segments joined by `/`
 *   - `~` is escaped to `~0`
 *   - `/` is escaped to `~1`
 *
 * Arrays are diffed by INDEX, not by content. A typical Postel-y mutation
 * pattern that appends entries produces a clean `add` at the new index;
 * inserts in the middle produce per-tail replaces + a single tail add, which
 * is verbose but correct (and the patches are still applicable). For pretty
 * "moved entry" detection a content-keyed differ is the right tool; defer.
 *
 * Performance: a single tree walk, O(n) over the combined node count of
 * `before` and `after`. The dominant cost in production callers is the
 * `makeDeepCopy` snapshot they already take.
 */

export type JsonPatchOp =
  | { op: 'add'; path: string; value: unknown }
  | { op: 'remove'; path: string }
  | { op: 'replace'; path: string; value: unknown };

export type JsonPatch = JsonPatchOp[];

/**
 * Escape a key for use as a JSON Pointer segment per RFC 6901: `~` -> `~0`,
 * `/` -> `~1`. Order matters — escape `~` first so we don't double-escape.
 */
function escapeSegment(key: string | number): string {
  return String(key).replace(/~/g, '~0').replace(/\//g, '~1');
}

/**
 * Cheap equality for leaf values. Primitives compare by `===`; `NaN === NaN`
 * is false so we special-case it. Dates and other objects fall through to
 * structural comparison via the recursive walker.
 */
function leafEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === 'number' && typeof b === 'number' && Number.isNaN(a) && Number.isNaN(b)) return true;
  return false;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Generate an RFC 6902 patch that, when applied to `before`, produces a
 * value structurally equal to `after`.
 */
export function generatePatch(before: unknown, after: unknown): JsonPatch {
  const ops: JsonPatch = [];
  diff(before, after, '', ops);
  return ops;
}

function diff(before: unknown, after: unknown, path: string, ops: JsonPatch): void {
  // Identical references / primitives — nothing to do.
  if (leafEqual(before, after)) return;

  // Type or shape mismatch at this position — replace wholesale. Arrays and
  // objects are different "kinds" for RFC 6902 purposes.
  const beforeIsArray = Array.isArray(before);
  const afterIsArray = Array.isArray(after);
  const beforeIsObject = isObject(before);
  const afterIsObject = isObject(after);

  if (beforeIsArray !== afterIsArray || beforeIsObject !== afterIsObject) {
    ops.push({ op: 'replace', path, value: after });
    return;
  }

  if (beforeIsArray && afterIsArray) {
    diffArrays(before as unknown[], after as unknown[], path, ops);
    return;
  }

  if (beforeIsObject && afterIsObject) {
    diffObjects(before, after, path, ops);
    return;
  }

  // Leaf scalars that differ.
  ops.push({ op: 'replace', path, value: after });
}

function diffObjects(
  before: Record<string, unknown>,
  after: Record<string, unknown>,
  path: string,
  ops: JsonPatch,
): void {
  // Removes — keys present in `before` but absent in `after`. Emit first so
  // any subsequent path-shifting (irrelevant for our index-based array
  // strategy but still polite) is well-defined.
  for (const key of Object.keys(before)) {
    if (!(key in after)) {
      ops.push({ op: 'remove', path: `${path}/${escapeSegment(key)}` });
    }
  }

  // Adds + replaces. Iterate `after` so the patch order reflects "the new
  // shape" rather than the diff direction — easier to read.
  for (const key of Object.keys(after)) {
    const childPath = `${path}/${escapeSegment(key)}`;
    if (!(key in before)) {
      ops.push({ op: 'add', path: childPath, value: after[key] });
    } else {
      diff(before[key], after[key], childPath, ops);
    }
  }
}

function diffArrays(before: unknown[], after: unknown[], path: string, ops: JsonPatch): void {
  const beforeLen = before.length;
  const afterLen = after.length;
  const sharedLen = Math.min(beforeLen, afterLen);

  // Replace differing entries within the shared prefix.
  for (let i = 0; i < sharedLen; i++) {
    diff(before[i], after[i], `${path}/${i}`, ops);
  }

  if (afterLen > beforeLen) {
    // Append new entries at the tail. RFC 6902 allows `path: "/.../-"` for
    // append, but a numeric index is more debuggable and works the same way
    // when re-applied — keep explicit indices.
    for (let i = beforeLen; i < afterLen; i++) {
      ops.push({ op: 'add', path: `${path}/${i}`, value: after[i] });
    }
  } else if (beforeLen > afterLen) {
    // Remove trailing entries. Emit highest-index-first so each remove is
    // valid against the array state after the prior remove (RFC 6902
    // semantics — applying patch ops in order).
    for (let i = beforeLen - 1; i >= afterLen; i--) {
      ops.push({ op: 'remove', path: `${path}/${i}` });
    }
  }
}
