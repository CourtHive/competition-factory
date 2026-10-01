import { destroyGroupEntry } from './destroyGroupEntry';

// constants and types
import {
  ErrorType,
  MISSING_PARTICIPANT_IDS,
  MISSING_TOURNAMENT_RECORD,
  PARTICIPANT_ENTRY_NOT_FOUND,
} from '@Constants/errorConditionConstants';
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
  if (!Array.isArray(participantIds) || !participantIds.length) return { error: MISSING_PARTICIPANT_IDS };

  let destroyedCount = 0;
  const errors: ErrorType[] = [];

  for (const participantId of participantIds) {
    const result = destroyGroupEntry({ participantId, ...rest });
    if (result.success) destroyedCount += 1;
    if (result.error) errors.push(result.error);
  }

  // A refusal is ONE error, never an array: `ResultType.error` is an `ErrorType`, and every
  // consumer (rollback, a client switching on `error.code`, the golden corpus) reads it as one.
  // The first failure is the error; every failure is in `context.errors`, on refusal and on a
  // partial success alike, so a mixed batch no longer swallows what it could not destroy.
  if (!destroyedCount) return { error: errors[0] ?? PARTICIPANT_ENTRY_NOT_FOUND, context: { errors } };
  return { destroyedCount, ...SUCCESS, ...(errors.length ? { context: { errors } } : {}) };
}
