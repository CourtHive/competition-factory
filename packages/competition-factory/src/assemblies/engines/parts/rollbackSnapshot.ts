import { getNoticeBuffer, getProvider, getTournamentId, getTournamentRecords } from '@Global/state/globalState';
import { captureOperation, OperationState } from '@Assemblies/engines/parts/operationState';
import { isBuiltinMethod } from '@Forge/previewBindings';
import { isPlainContainer } from '@Tools/cloneState';
import { ownMethod } from '@Tools/ownMethod';
import { isFunction } from '@Tools/objects';

// constants and types
import { ErrorType, ROLLBACK_UNAVAILABLE } from '@Constants/errorConditionConstants';
import { Directives } from '@Types/factoryTypes';

/**
 * WHEN A ROLLBACK NEEDS A SNAPSHOT. `rollbackOnError` restores every loaded record on a refusal, and the snapshot that
 * makes this possible is a deep copy of every loaded record, taken before the call or queue runs (about 2.4 ms per MB).
 * A factory method that refuses before its first write leaves nothing to restore, so a call or queue made of ONE such
 * method takes no snapshot: on a refusal it puts back the selection, the notice buffer and the modification flag, and
 * returns exactly what the snapshot path returns.
 *
 * A snapshot is still taken for:
 * - any queue of more than one directive: an earlier directive's writes are undone only from a snapshot;
 * - a method that is not one of the factory's own (an imported or passed custom method): the factory cannot know
 *   whether it writes before refusing;
 * - a bulk method (`PARTIAL_COMMIT_METHODS`): each item commits on its own, so a refused call can have committed items.
 *
 * Every other factory method refuses before its first write: a public method takes ids, never resolved draw state, so
 * no caller can hand one past the checks it makes before writing. The list is explicit and exhaustive by method name:
 * a new bulk writer is added here (rollbackSnapshot.test.ts fails when a module runs `bulkItem` for a method not
 * listed).
 *
 * What the skip gives up: a programming error that throws partway through a write is no longer undone. Such a call
 * returns `rolledBack: false`, never a restore that did not happen.
 */
export const PARTIAL_COMMIT_METHODS: ReadonlySet<string> = new Set([
  'bulkMatchUpStatusUpdate',
  'deleteCourts',
  'resetAdHocMatchUps',
]);

/** true when one call of `method` can only succeed or refuse having written nothing */
export function cannotPartlyCommit(methodName: string, method: unknown): boolean {
  return isBuiltinMethod(method) && !PARTIAL_COMMIT_METHODS.has(methodName);
}

/** true when a queue is one directive that cannot partly commit */
export function queueCannotPartlyCommit(directives: Directives, methods: { [key: string]: unknown }): boolean {
  if (directives.length !== 1) return false;
  const [{ method: methodName }] = directives;
  return cannotPartlyCommit(methodName, ownMethod(methods, methodName));
}

/**
 * What a rollback puts back. A call that cannot partly commit keeps everything but the records: a refusal leaves them
 * as they were. Any other call snapshots the records too (captureOperation), or is refused when they cannot be.
 *
 * A call that takes no snapshot is refused exactly when the snapshot path would refuse it (`ROLLBACK_UNAVAILABLE`, a
 * record the factory's copy could not restore), without copying anything: every record's root must be a plain object
 * holding its own tournamentId. A provider with its own snapshot hook is always asked through captureOperation.
 */
export function captureRollback(
  atomic: boolean,
): { captured: OperationState; error?: undefined } | { error: ErrorType; captured?: undefined } {
  if (!atomic || isFunction(getProvider().makeDeepCopy)) return captureOperation();
  const live = getTournamentRecords();
  const restorable =
    isPlainContainer(live as unknown) &&
    Object.keys(live).every((id) => live[id]?.tournamentId === id && isPlainContainer(live[id]));
  if (!restorable) return { error: ROLLBACK_UNAVAILABLE };
  return { captured: { tournamentId: getTournamentId(), notices: getNoticeBuffer(), borrowed: false, atomic: true } };
}
