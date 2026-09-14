import { destroyGroupEntry } from './destroyGroupEntry';

// constants and types
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DrawDefinition, Tournament, Event } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

/**
 *
 * @param {object} tournamentRecord - passed in by tournamentEngine
 * @param {string} participantId - id of TEAM/PAIR participant to remove
 * @param {string} eventId - resolved to { event } by tournamentEngine
 * @param {string} drawId - optional - resolved to { drawDefinition }
 * @param {boolean} removeGroupParticipant - whether to also remove grouping participant from tournamentRecord.participants
 *
 */

type DestroyPairEntryArgs = {
  removeGroupParticipant?: boolean;
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  participantId: string;
  drawId?: string;
  event: Event;
};
export function destroyPairEntry({
  removeGroupParticipant,
  tournamentRecord,
  drawDefinition,
  participantId,
  drawId,
  event,
}: DestroyPairEntryArgs) {
  return destroyGroupEntry({
    removeGroupParticipant,
    tournamentRecord,
    drawDefinition,
    participantId,
    drawId,
    event,
  });
}

export function destroyPairEntries(params) {
  if (!params.tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { participantIds, ...rest } = params;

  let destroyedCount = 0;
  const errors: any[] = [];

  for (const participantId of participantIds) {
    const result = destroyGroupEntry({ participantId, ...rest });
    if (result.success) destroyedCount += 1;
    if (result.error) errors.push(result.error);
  }

  return destroyedCount ? { destroyedCount, ...SUCCESS } : { error: errors };
}
