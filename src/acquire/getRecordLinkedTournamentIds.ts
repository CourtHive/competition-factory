import { findExtension } from './findExtension';

// constants and types
import { LINKED_TOURNAMENTS } from '@Constants/extensionConstants';

/**
 * Mode-agnostic read of the linked-tournaments list on a single
 * `tournamentRecord`. Returns a flat string array.
 *
 * The CODES first-class attribute is `tournamentRecord.linkedTournamentIds`
 * (flat `string[]`). The legacy extension uses the typo-spelled name
 * `linkedTournamentsIds` (see `extensionConstants.ts`) and wraps the array
 * in a `{tournamentIds: []}` object. This helper handles both shapes so
 * callers don't need to branch on `schemaWriteMode`.
 *
 * First-class wins when present; falls back to the legacy extension.
 */
export function getRecordLinkedTournamentIds(tournamentRecord: any): string[] {
  if (Array.isArray(tournamentRecord?.linkedTournamentIds)) {
    return tournamentRecord.linkedTournamentIds;
  }
  const { extension } = findExtension({ element: tournamentRecord, name: LINKED_TOURNAMENTS });
  return extension?.value?.tournamentIds ?? [];
}
