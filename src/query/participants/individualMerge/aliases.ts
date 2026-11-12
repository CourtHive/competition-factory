// constants and types
import { INVALID_VALUES, PARTICIPANT_ID_RETIRED } from '@Constants/errorConditionConstants';
import type { IndividualMergeLedger } from '@Types/individualParticipantMerge';
import { INDIVIDUAL_PARTICIPANT_MERGES } from '@Constants/extensionConstants';
import type { Tournament } from '@Types/tournamentTypes';

export function readIndividualMergeLedger(tournamentRecord: Tournament): IndividualMergeLedger {
  const extension = tournamentRecord.extensions?.find(({ name }) => name === INDIVIDUAL_PARTICIPANT_MERGES);
  if (!extension) return { version: 1, aliases: {} };
  const ledger = extension.value as IndividualMergeLedger;
  if (ledger?.version !== 1 || !ledger.aliases || typeof ledger.aliases !== 'object' || Array.isArray(ledger.aliases)) {
    throw new Error('Invalid individual participant merge ledger');
  }
  return ledger;
}

export function resolveMergedParticipantId({
  tournamentRecord,
  participantId,
}: {
  tournamentRecord: Tournament;
  participantId: string;
}) {
  const aliases = readIndividualMergeLedger(tournamentRecord).aliases;
  const visited = new Set<string>();
  let canonicalParticipantId = participantId;
  while (Object.hasOwn(aliases, canonicalParticipantId)) {
    if (visited.has(canonicalParticipantId) || typeof aliases[canonicalParticipantId] !== 'string') {
      throw new Error('Invalid individual participant alias chain');
    }
    visited.add(canonicalParticipantId);
    canonicalParticipantId = aliases[canonicalParticipantId];
  }
  if (
    visited.size &&
    !tournamentRecord.participants?.some((participant) => participant.participantId === canonicalParticipantId)
  ) {
    throw new Error('Retained participant is missing');
  }
  return canonicalParticipantId;
}

export function retiredParticipantCheck(tournamentRecord: Tournament, participantIds: string[]) {
  try {
    for (const alias of Object.keys(readIndividualMergeLedger(tournamentRecord).aliases)) {
      resolveMergedParticipantId({ tournamentRecord, participantId: alias });
    }
    for (const participantId of participantIds) {
      const canonicalParticipantId = resolveMergedParticipantId({ tournamentRecord, participantId });
      if (canonicalParticipantId !== participantId) {
        return { error: PARTICIPANT_ID_RETIRED, context: { participantId, canonicalParticipantId } };
      }
    }
  } catch {
    return { error: INVALID_VALUES, info: 'Invalid individual participant merge ledger' };
  }
  return undefined;
}
