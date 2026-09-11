import { getRecordLinkedTournamentIds } from '@Acquire/getRecordLinkedTournamentIds';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import {
  getTournamentId,
  getTournamentRecords,
  setTournamentRecords,
  setTournamentRecord as globalSetTournamentRecord,
  getTournamentRecord,
  setTournamentId,
} from '@Global/state/globalState';

// constants and types
import { INVALID_OBJECT, INVALID_RECORDS, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';

type GetStateArgs = {
  convertExtensions?: boolean;
  removeExtensions?: boolean;
};
export function getState({ convertExtensions, removeExtensions }: GetStateArgs) {
  const tournamentRecords = getTournamentRecords();
  const tournamentId = getTournamentId();
  return {
    tournamentId,
    tournamentRecords: makeDeepCopy(tournamentRecords, convertExtensions, false, removeExtensions),
  };
}

type GetTournamentArgs = {
  convertExtensions?: boolean;
  removeExtensions?: boolean;
  tournamentId: string | undefined;
};

export function getTournament(params?: GetTournamentArgs) {
  const { convertExtensions = false, removeExtensions = false } = params ?? {};
  const tournamentId = params?.tournamentId ?? getTournamentId();
  if (typeof tournamentId !== 'string') return {};
  const tournamentRecord = getTournamentRecord(tournamentId);
  return {
    tournamentRecord: makeDeepCopy(tournamentRecord, convertExtensions, false, removeExtensions),
  };
}

export function removeUnlinkedTournamentRecords(): void {
  const tournamentRecords = getTournamentRecords();

  // CODES: collect linked ids across every record in state (mode-agnostic).
  // The previous `findExtension({discover:true})` pulled the first matching
  // extension only — sufficient because `linkTournaments` writes the same
  // value into every record. The shadow-write equivalent walks each record.
  const tournamentIds = new Set<string>();
  for (const record of Object.values(tournamentRecords)) {
    for (const id of getRecordLinkedTournamentIds(record)) tournamentIds.add(id);
  }

  Object.keys(tournamentRecords).forEach((tournamentId) => {
    if (!tournamentIds.has(tournamentId)) delete tournamentRecords[tournamentId];
  });

  return setTournamentRecords(tournamentRecords);
}

export function setTournamentRecord(record, deepCopyOption = true): ResultType {
  if (typeof record !== 'object' || Array.isArray(record)) return { error: INVALID_OBJECT };

  if (!record?.tournamentId) return { error: INVALID_VALUES };

  return globalSetTournamentRecord(deepCopyOption ? makeDeepCopy(record) : record);
}

export function setState(records, deepCopyOption = true) {
  if (typeof records !== 'object') return { error: INVALID_OBJECT };

  setTournamentId();
  if (Array.isArray(records)) {
    const validRecordsArray = records.filter((record) => record?.tournamentId).length === records.length;

    if (!validRecordsArray) return { error: INVALID_RECORDS };

    records = Object.assign({}, ...records.map((record) => ({ [record.tournamentId]: record })));
  } else if (records?.tournamentId) {
    records = { [records.tournamentId]: records };
    setTournamentId(records.tournamentId);
  } else {
    const validRecordsObject = Object.keys(records).every(
      (tournamentId) => records[tournamentId].tournamentId === tournamentId,
    );
    if (!validRecordsObject) return { error: INVALID_RECORDS };
  }

  return setTournamentRecords(deepCopyOption ? makeDeepCopy(records) : records);
}
