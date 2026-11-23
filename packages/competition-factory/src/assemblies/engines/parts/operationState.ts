import { cloneState, isPlainContainer, restoreState, StateClone } from '@Tools/cloneState';
import { isFunction, isObject } from '@Tools/objects';
import {
  clearMutationStatus,
  deepCopyEnabled,
  getNoticeBuffer,
  getProvider,
  getTournamentId,
  getTournamentRecords,
  setNoticeBuffer,
  setTournamentId,
  setTournamentRecords,
  Notice,
} from '@Global/state/globalState';

// constants and types
import { ErrorType, ROLLBACK_UNAVAILABLE } from '@Constants/errorConditionConstants';
import { TournamentRecords } from '@Types/factoryTypes';

/**
 * What an operation must put back when it is refused (rollbackOnError) or previewed (dryRun).
 *
 * The records alone are not the operation's state. A refused write also leaves its notices in the
 * buffer, where the next successful call delivered them, and leaves the mutation flag set, so the
 * next call stamped every record. Restoring through `setState` cleared the selected tournament
 * whenever more than one record was loaded.
 */
export type OperationState = {
  records: TournamentRecords;
  tournamentId?: string;
  notices?: Notice[];
  /** deep copy disabled: the engine works on the caller's own objects, which a restore must keep */
  borrowed: boolean;
  /** the factory's own snapshot, which maps each copy back to its original object */
  clone?: StateClone<TournamentRecords>;
};

/**
 * Snapshot hooks a state provider may supply, for records whose objects the factory cannot copy or
 * restore by itself (a document-database document, for example):
 * - `makeDeepCopy(source, convertExtensions, internalUse, removeExtensions, { purpose })` is called
 *   with `purpose: 'snapshot'` for a rollback/preview snapshot. A hook that ignores the argument keeps
 *   working, but nothing then guarantees its snapshot is faithful: rollback integrity through such a
 *   hook is the hook's own.
 * - `restoreSnapshot(liveRecords, snapshot)` writes a snapshot back into records the engine does not
 *   own. Without it, a provider-made snapshot can only be restored when the engine owns the records.
 */
export type SnapshotPurpose = { purpose: 'snapshot' };

/**
 * Captures the operation's state, or refuses. Whether the snapshot can be restored is established
 * HERE, before the first directive runs: a rollback discovered to be impossible after the writes
 * would leave them in place.
 */
export function captureOperation(): { captured: OperationState; error?: undefined } | { error: ErrorType } {
  const live = getTournamentRecords();
  const provider = getProvider();
  const borrowed = !deepCopyEnabled().enabled;

  const providerSnapshot = isFunction(provider.makeDeepCopy);
  const clone = providerSnapshot ? undefined : cloneState(live);
  const records: TournamentRecords = clone
    ? clone.copy
    : provider.makeDeepCopy(live, false, true, false, { purpose: 'snapshot' } satisfies SnapshotPurpose);

  // Each record must have been COPIED into a plain record of the same id. A record whose root is not
  // a plain object (a database document instance) is kept by reference by the factory's own clone,
  // so its "snapshot" would be the live object itself, and restoring it would restore nothing.
  const restorable =
    isObject(records) &&
    Object.keys(records).every(
      (id) => isPlainContainer(records[id]) && records[id] !== live[id] && records[id].tournamentId === id,
    );
  const restorableInPlace = !borrowed || !!clone || isFunction(provider.restoreSnapshot);
  if (!restorable || !restorableInPlace) return { error: ROLLBACK_UNAVAILABLE };

  return {
    captured: { records, tournamentId: getTournamentId(), notices: getNoticeBuffer(), borrowed, clone },
  };
}

/**
 * Puts back what `captureOperation` took.
 *
 * When the engine owns the records, the private snapshot is installed as it is: restoring through
 * `setState` copied it a second time and reset the selection. When the engine works on the caller's
 * objects, the snapshot is written back INTO them, so the caller's objects keep their identity and
 * regain their values; installing a copy instead left the caller holding the refused writes while
 * every later mutation went to a copy the caller never saw.
 */
export function restoreOperation({ records, tournamentId, notices, borrowed, clone }: OperationState): void {
  if (!borrowed) {
    setTournamentRecords(records);
  } else if (clone) {
    setTournamentRecords(restoreState(clone));
  } else {
    const live = getTournamentRecords();
    setTournamentRecords(getProvider().restoreSnapshot(live, records) ?? live);
  }
  setTournamentId(tournamentId);
  setNoticeBuffer(notices);
  clearMutationStatus(); // a refused write is not a modification
}
