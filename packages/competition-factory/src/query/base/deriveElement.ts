import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';

// constants
import { MISSING_VALUE } from '@Constants/errorConditionConstants';

export function deriveElement(params) {
  const { tournamentRecord, participantId } = params;
  if (participantId) {
    const result = findTournamentParticipant({ tournamentRecord, participantId });
    return result.participant ?? result;
  }
  const element = params.element || params.drawDefinition || params.event || params.tournamentRecord;
  if (element) return element;

  return { error: MISSING_VALUE };
}
