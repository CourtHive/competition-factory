import type { ContextProfile } from '@Types/factoryTypes';

/**
 * `contextProfile.exclude` names attributes the caller does not want on the hydrated matchUps it receives. It is a
 * redaction of the result, never of the work: completion, bucketing, filtering and schedule order all read
 * hydrated matchUps, and when the attributes were deleted during hydration a completed draw reported
 * `drawCompleted: false` under `exclude: ['matchUpStatus']` (punch list P56).
 *
 * So the outermost caller takes `exclude` off the profile it hands down and redacts what comes back. Every
 * inner layer then sees no `exclude` and redacts nothing, whichever layer the caller entered at: the engine's
 * method dispatch, or a governor function called directly.
 */
export function withContextExclusion<P extends { contextProfile?: ContextProfile } | undefined, R>(
  params: P,
  run: (params: P) => R,
): R {
  const exclude = params?.contextProfile?.exclude;
  if (!Array.isArray(exclude) || !exclude.length) return run(params);

  const { exclude: _exclude, ...contextProfile } = params?.contextProfile ?? {};
  const result = run({ ...params, contextProfile } as P);
  if (result instanceof Promise) return result.then((resolved) => redactHydratedMatchUps(resolved, exclude)) as R;
  return redactHydratedMatchUps(result, exclude);
}

/**
 * Returns `value` with `exclude` removed from every hydrated matchUp (`hasContext: true`) it contains, nested
 * `tieMatchUps` included. Nothing is written: a hydrated matchUp is replaced by a copy, and so is each container
 * on the path to one, while everything else is returned as it was. A matchUp reached twice (a structure's
 * `matchUps` and its `roundMatchUps`, a dual and its lines) becomes one copy, so shared references stay shared.
 */
export function redactHydratedMatchUps<T>(value: T, exclude: string[]): T {
  const excluded = new Set(exclude);
  const redacted = new Map<object, unknown>();

  const visit = (node: unknown): unknown => {
    if (!node || typeof node !== 'object') return node;
    if (redacted.has(node)) return redacted.get(node);
    if (!Array.isArray(node) && !isPlainObject(node)) return node;

    redacted.set(node, node); // a cycle resolves to the original rather than recursing forever
    const copy = Array.isArray(node)
      ? redactArray(node, visit)
      : redactObject(node as Record<string, unknown>, excluded, visit);
    redacted.set(node, copy);
    return copy;
  };

  return visit(value) as T;
}

function redactArray(node: unknown[], visit: (node: unknown) => unknown) {
  let copy: unknown[] | undefined;
  node.forEach((item, i) => {
    const next = visit(item);
    if (next === item) return;
    copy ??= node.slice();
    copy[i] = next;
  });
  return copy ?? node;
}

function redactObject(node: Record<string, unknown>, excluded: Set<string>, visit: (node: unknown) => unknown) {
  const hydrated = node.hasContext === true;
  let copy: Record<string, unknown> | undefined = hydrated ? {} : undefined;
  for (const [key, child] of Object.entries(node)) {
    if (hydrated && excluded.has(key)) continue;
    const next = visit(child);
    if (copy) {
      copy[key] = next;
    } else if (next !== child) {
      copy = { ...node, [key]: next };
    }
  }
  return copy ?? node;
}

function isPlainObject(node: object) {
  const prototype = Object.getPrototypeOf(node);
  return prototype === Object.prototype || prototype === null;
}
