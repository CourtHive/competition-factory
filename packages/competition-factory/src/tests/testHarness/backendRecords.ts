import { getTournamentRecords, markModified, setTournamentRecords } from '@Global/state/globalState';
import { canonicalHash } from './corpus/hash';

/**
 * The records a second implementation returns become the engine's state, and each one it changed is marked modified,
 * by its tournamentId, so the engine's factory stamp goes to it and only to it (getMutationStatus stamps the records a
 * call modified, building-a-tournament.md § 1.1). A record it returned unchanged is not marked.
 */
export function adoptBackendRecords(records: any[]) {
  const before = new Map(
    Object.values(getTournamentRecords() ?? {}).map((record: any) => [record.tournamentId, canonicalHash(record)]),
  );
  for (const record of records) {
    if (before.get(record.tournamentId) !== canonicalHash(record)) markModified(record.tournamentId);
  }
  setTournamentRecords(Object.fromEntries(records.map((record) => [record.tournamentId, record])));
}
