import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { isObject } from '@Tools/objects';
import {
  cycleMutationStatus,
  getNoticeBuffer,
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
};

/**
 * Captures the operation's state, or refuses. A snapshot that is not a set of tournament records
 * (what a copy produces of a record it cannot walk, or one made under an `ignore` that drops
 * `tournamentId`) could never be restored. That is established HERE, before the first directive
 * runs, because a rollback discovered to be impossible after the writes would leave them in place.
 */
export function captureOperation(): { captured: OperationState; error?: undefined } | { error: ErrorType } {
  const records = makeDeepCopy(getTournamentRecords(), false, true);
  const restorable =
    isObject(records) && Object.keys(records).every((id) => isObject(records[id]) && records[id].tournamentId === id);
  if (!restorable) return { error: ROLLBACK_UNAVAILABLE };

  return { captured: { records, tournamentId: getTournamentId(), notices: getNoticeBuffer() } };
}

/**
 * Puts back what `captureOperation` took. The snapshot is private to the operation, so it is
 * installed as it is: restoring through `setState` copied it a second time and reset the selection.
 */
export function restoreOperation({ records, tournamentId, notices }: OperationState): void {
  setTournamentRecords(records);
  setTournamentId(tournamentId);
  setNoticeBuffer(notices);
  cycleMutationStatus(); // a refused write is not a modification
}
