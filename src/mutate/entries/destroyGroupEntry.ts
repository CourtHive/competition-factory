import { deleteParticipants } from '../participants/deleteParticipants';
import { getStageEntries } from '@Query/drawDefinition/getStageEntries';
import { decorateResult } from '@Functions/global/decorateResult';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getParticipantId } from '@Functions/global/extractors';
import { removeEventEntries } from './removeEventEntries';
import { addEventEntries } from './addEventEntries';
import { arrayIndices } from '@Tools/arrays';

// Constants and types
import { TOURNAMENT_RECORD, PARTICIPANT_ID, EVENT } from '@Constants/attributeConstants';
import { DrawDefinition, Tournament, Event } from '@Types/tournamentTypes';
import { PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { DOUBLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { UNGROUPED } from '@Constants/entryStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  INVALID_EVENT_TYPE,
  INVALID_PARTICIPANT_TYPE,
  PARTICIPANT_ENTRY_NOT_FOUND,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/**
 * When grouped participant entries are destroyed, individualParticipantIds will be added as { individualEntryStatus } participant entries
 */

type DestroyGroupEntryArgs = {
  removeGroupParticipant?: boolean; // whether to also remove grouping participant from tournamentRecord.participants
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  participantId: string; // id of TEAM/PAIR participant to remove
  drawId?: string;
  stage?: string;
  event: Event;
};

export function destroyGroupEntry({
  removeGroupParticipant,
  tournamentRecord,
  drawDefinition,
  participantId,
  drawId,
  stage,
  event,
}: DestroyGroupEntryArgs): {
  success?: boolean;
  error?: ErrorType;
  participantRemoved?: boolean;
} {
  const stack = 'destroyGroupEntry';
  const paramsCheck = requireParams({ tournamentRecord, participantId, event }, [
    TOURNAMENT_RECORD,
    PARTICIPANT_ID,
    EVENT,
  ]);
  if (paramsCheck.error) return paramsCheck;

  if (!event.eventType || ![DOUBLES_EVENT, TEAM_EVENT].includes(event.eventType)) {
    return decorateResult({ result: { error: INVALID_EVENT_TYPE }, stack });
  }

  const tournamentParticipants = tournamentRecord.participants ?? [];
  const participant = tournamentParticipants.find((participant) => participant.participantId === participantId);

  if (!participant) {
    return decorateResult({ result: { error: PARTICIPANT_NOT_FOUND }, stack });
  }

  if (
    !participant.participantType ||
    ![PAIR, TEAM_PARTICIPANT].includes(participant.participantType) ||
    (participant.participantType === TEAM_PARTICIPANT && event.eventType !== TEAM_EVENT) ||
    (participant.participantType === PAIR && event.eventType !== DOUBLES_EVENT)
  ) {
    return { error: INVALID_PARTICIPANT_TYPE };
  }

  const eventEntries = event.entries ?? [];
  const entry = eventEntries.find((entry) => entry.participantId === participantId);
  if (!entry) return { error: PARTICIPANT_ENTRY_NOT_FOUND };

  const { stageEntries } = getStageEntries({
    selected: false,
    drawDefinition,
    drawId,
    event,
    stage,
  });
  const groupedParticipantIds = stageEntries.map(getParticipantId);
  const individualParticipantIdsInGroups = tournamentParticipants
    .filter(({ participantId }) => groupedParticipantIds.includes(participantId))
    .map(({ individualParticipantIds }) => individualParticipantIds)
    .flat()
    .filter(Boolean);

  // find only those individualParticipantIds which do not occur MULTIPLE TIMES in PAIRs/GROUPs in the event.entries or drawEntries
  // this scenario can occur in e.g. ITA tournaments where an individual participant is paired multiple times across flights
  const individualParticipantIds = participant.individualParticipantIds?.filter(
    (participantId) => arrayIndices(participantId, individualParticipantIdsInGroups).length === 1,
  );

  // remove the group participant from event entries
  let result = removeEventEntries({
    participantIds: [participantId],
    event,
  });
  if (result.error) return result;

  if (individualParticipantIds?.length) {
    result = addEventEntries({
      participantIds: individualParticipantIds,
      entryStatus: UNGROUPED,
      entryStage: entry.entryStage,
      tournamentRecord,
      drawDefinition,
      drawId,
      event,
    });
    if (result.error) return result;
  }

  let participantRemoved;
  if (removeGroupParticipant) {
    const result = deleteParticipants({
      participantIds: [participantId],
      tournamentRecord,
    });
    if (result.success) participantRemoved = true;
  }

  return { ...SUCCESS, participantRemoved };
}
