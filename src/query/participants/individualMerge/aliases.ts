// constants and types
import { INVALID_VALUES, PARTICIPANT_ID_RETIRED } from '@Constants/errorConditionConstants';
import type { IndividualMergeLedger } from '@Types/individualParticipantMerge';
import { INDIVIDUAL_PARTICIPANT_MERGES } from '@Constants/extensionConstants';
import type { Tournament } from '@Types/tournamentTypes';

const INVALID_LEDGER = 'Invalid individual participant merge ledger';

export function readIndividualMergeLedger(tournamentRecord: Tournament): IndividualMergeLedger {
  const extension = tournamentRecord.extensions?.find(({ name }) => name === INDIVIDUAL_PARTICIPANT_MERGES);
  if (!extension) return { version: 1, aliases: {} };
  const ledger = extension.value as IndividualMergeLedger;
  if (ledger?.version !== 1 || !ledger.aliases || typeof ledger.aliases !== 'object' || Array.isArray(ledger.aliases)) {
    throw new Error(INVALID_LEDGER);
  }
  return ledger;
}

/**
 * Follow a retired ID to its retained ID. The retained participant may since have been deleted: a retired ID stays
 * retired, so an importer re-creates the survivor rather than the duplicate.
 */
export function resolveMergedParticipantId({
  tournamentRecord,
  participantId,
}: {
  tournamentRecord: Tournament;
  participantId: string;
}) {
  return followAliases(readIndividualMergeLedger(tournamentRecord).aliases, participantId);
}

function followAliases(aliases: Record<string, string>, participantId: string) {
  const visited = new Set<string>();
  let canonicalParticipantId = participantId;
  while (Object.hasOwn(aliases, canonicalParticipantId)) {
    if (visited.has(canonicalParticipantId) || typeof aliases[canonicalParticipantId] !== 'string') {
      throw new Error('Invalid individual participant alias chain');
    }
    visited.add(canonicalParticipantId);
    canonicalParticipantId = aliases[canonicalParticipantId];
  }
  return canonicalParticipantId;
}

/** Whole-ledger validation, for writers of the ledger. Adders check only the IDs they add. */
export function invalidLedgerCheck(tournamentRecord: Tournament) {
  try {
    const aliases = readIndividualMergeLedger(tournamentRecord).aliases;
    for (const alias of Object.keys(aliases)) followAliases(aliases, alias);
  } catch {
    return { error: INVALID_VALUES, info: INVALID_LEDGER };
  }
  return undefined;
}

export function retiredParticipantCheck(tournamentRecord: Tournament, participantIds: string[]) {
  try {
    for (const participantId of participantIds) {
      const canonicalParticipantId = resolveMergedParticipantId({ tournamentRecord, participantId });
      if (canonicalParticipantId !== participantId) {
        return { error: PARTICIPANT_ID_RETIRED, context: { participantId, canonicalParticipantId } };
      }
    }
  } catch {
    return { error: INVALID_VALUES, info: INVALID_LEDGER };
  }
  return undefined;
}
