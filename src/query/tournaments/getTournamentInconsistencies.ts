import { getEventInconsistencies } from '@Query/event/getEventInconsistencies';
import { finalize, Inconsistency } from '@Query/integrity/inconsistency';
import { getParticipants } from '@Query/participants/getParticipants';

// constants and types
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

// getTournamentInconsistencies is the top layer of the integrity hierarchy. It fans out to
// getEventInconsistencies for every event (stamping tournamentId, and resolving the participantMap
// once for reuse across events) and adds the checks that are only visible tournament-wide — i.e.
// across events. Phase 1 implements identity duplication; scheduling collisions and date
// containment are deferred (they require the scheduling model and are a later sub-phase).
//
//  - PARTICIPANT_IDENTITY_DUPLICATION: a single person (personId) is represented by more than one
//    distinct INDIVIDUAL participant — the classic merged/imported-data defect that silently splits
//    a competitor's results across two identities. (warning)
export const PARTICIPANT_IDENTITY_DUPLICATION = 'PARTICIPANT_IDENTITY_DUPLICATION';

type GetTournamentInconsistenciesArgs = {
  tournamentRecord?: Tournament;
};

function getIdentityDuplications(tournamentRecord: Tournament): any[] {
  const participantIdsByPersonId = new Map<string, string[]>();
  for (const participant of tournamentRecord.participants ?? []) {
    if (participant.participantType !== INDIVIDUAL) continue;
    const personId = participant.person?.personId;
    if (!personId) continue;
    const participantIds = participantIdsByPersonId.get(personId) ?? [];
    participantIds.push(participant.participantId);
    participantIdsByPersonId.set(personId, participantIds);
  }

  const inconsistencies: any[] = [];
  for (const [personId, participantIds] of participantIdsByPersonId) {
    if (participantIds.length > 1) {
      inconsistencies.push({
        issueType: PARTICIPANT_IDENTITY_DUPLICATION,
        message: `person ${personId} is represented by ${participantIds.length} distinct INDIVIDUAL participants`,
        severity: 'warning',
        personId,
        participantIds,
      });
    }
  }
  return inconsistencies;
}

export function getTournamentInconsistencies(
  params: GetTournamentInconsistenciesArgs,
): ResultType & { valid?: boolean; inconsistencies?: Inconsistency[] } {
  const { tournamentRecord } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const tournamentId = tournamentRecord.tournamentId;

  // resolve the participantMap once and reuse it across every event's coherence check
  const { participantMap } = getParticipants({ tournamentRecord });

  const eventInconsistencies = (tournamentRecord.events ?? []).flatMap(
    (event) => getEventInconsistencies({ event, tournamentRecord, participantMap }).inconsistencies ?? [],
  );

  const identityInconsistencies = getIdentityDuplications(tournamentRecord);

  const combined = [...eventInconsistencies, ...identityInconsistencies];
  const finalized = finalize(combined, { scope: 'TOURNAMENT', tournamentId });
  return { ...SUCCESS, valid: finalized.length === 0, inconsistencies: finalized };
}
