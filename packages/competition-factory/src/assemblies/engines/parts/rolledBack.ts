import { isObject } from '@Tools/objects';

// constants and types
import { PARTIAL_COMMIT } from '@Constants/resultConstants';
import type { ResultType } from '@Types/factoryTypes';

/**
 * A RESTORED RESULT KEEPS NOTHING. With `rollbackOnError`, a refused call or queue is restored whole, so its result
 * says so and claims no kept work:
 * - `rolledBack: true`;
 * - no `committed`, even when a bulk call had committed items before the restore;
 * - a bulk call's per-item `results` keep one entry per input, in order. A refused item keeps its `error`; an item that
 *   had succeeded loses `success` (and its `warnings`) and carries `rolledBack: true` beside its identifiers.
 *
 * The rest of the refusal (`error`, `info`, `context`, ...) is returned as it was.
 */
export function rolledBackResult<T extends ResultType & { [key: string]: any }>(result: T) {
  const { [PARTIAL_COMMIT]: _committed, results, ...refusal } = result;
  return {
    ...refusal,
    ...(Array.isArray(results) ? { results: results.map(rolledBackItem) } : {}),
    rolledBack: true as const,
  };
}

function rolledBackItem(item: unknown) {
  if (!isObject(item) || !('success' in (item as object))) return item;
  const { success: _success, warnings: _warnings, ...identifiers } = item as Record<string, unknown>;
  return { ...identifiers, rolledBack: true };
}
