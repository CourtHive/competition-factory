import { PARTIAL_COMMIT } from '@Constants/resultConstants';
import type { ResultType } from '@Types/factoryTypes';

/**
 * COMMITTED WORK ANNOUNCES ITSELF (CA, ruling 33, 2026-11-25). A bulk mutation commits each item on its own (ruling 8)
 * and returns the first refused item as its own `error`. When at least one item committed, it also returns
 * `committed: true`, and the engine then publishes the buffered notices, in the normal topic order, instead of deleting
 * them. A refused item buffers nothing, so it stays silent. With `rollbackOnError` the whole call is restored and
 * nothing is published, as before (ruling 9, condition 3).
 *
 * Read only on a refusal: a successful call never asks. The flag's name is `PARTIAL_COMMIT` (`resultConstants`), so a
 * mutation can set it without importing the engine.
 */
export function isPartialCommit(result?: ResultType & { [PARTIAL_COMMIT]?: boolean }): boolean {
  return !!result?.error && result[PARTIAL_COMMIT] === true;
}
