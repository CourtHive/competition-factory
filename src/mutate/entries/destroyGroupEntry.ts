import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { deleteParticipants } from '@Mutate/participants/deleteParticipants';
import { getStageEntries } from '@Query/drawDefinition/getStageEntries';
import { decorateResult } from '@Functions/global/decorateResult';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getParticipantId } from '@Functions/global/extractors';
import { removeEventEntries } from './removeEventEntries';
import { addEventEntries } from './addEventEntries';
import { arrayIndices } from '@Tools/arrays';

// constants and types
import { DrawDefinition, Entry, Event, Participant, Tournament } from '@Types/tournamentTypes';
import { TOURNAMENT_RECORD, PARTICIPANT_ID, EVENT } from '@Constants/attributeConstants';
import { PAIR, TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { DOUBLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { UNGROUPED } from '@Constants/entryStatusConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
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

type ReleasedSeat = { drawId?: string; structureId?: string; drawPosition?: number };

/**
 * Every refusal `destroyGroupEntry` can make, asked WITHOUT writing.
 *
 * A caller that must destroy a group entry as the SECOND step of a mutation (removing a PAIR from a
 * drawPosition and dissolving it) asks this before its first write, so a refusal leaves the record as
 * it was. `releasedSeat` names the one seat that caller is about to empty: the entry may still be
 * assigned there, and must not be assigned anywhere else — `removeEventEntries` refuses an entry that
 * holds any drawPosition in any of the event's draws.
 */
export function groupEntryDestructionError({
  tournamentRecord,
  participantId,
  releasedSeat,
  event,
}: {
  tournamentRecord: Tournament;
  releasedSeat?: ReleasedSeat;
  participantId: string;
  event: Event;
}): { error?: ErrorType } | undefined {
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

  const participant = (tournamentRecord.participants ?? []).find((p) => p.participantId === participantId);
  if (!participant) return decorateResult({ result: { error: PARTICIPANT_NOT_FOUND }, stack });

  if (
    !participant.participantType ||
    ![PAIR, TEAM_PARTICIPANT].includes(participant.participantType) ||
    (participant.participantType === TEAM_PARTICIPANT && event.eventType !== TEAM_EVENT) ||
    (participant.participantType === PAIR && event.eventType !== DOUBLES_EVENT)
  ) {
    return { error: INVALID_PARTICIPANT_TYPE };
  }

  if (!(event.entries ?? []).some((entry) => entry.participantId === participantId)) {
    return { error: PARTICIPANT_ENTRY_NOT_FOUND };
  }

  if (releasedSeat && assignedBeyondSeat({ event, participantId, releasedSeat })) {
    return decorateResult({ result: { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT }, stack });
  }

  return undefined;
}

function assignedBeyondSeat({
  event,
  participantId,
  releasedSeat,
}: {
  event: Event;
  participantId: string;
  releasedSeat: ReleasedSeat;
}): boolean {
  return (event.drawDefinitions ?? []).some((drawDefinition: DrawDefinition) =>
    (drawDefinition.structures ?? []).some((structure) =>
      (getPositionAssignments({ structure }).positionAssignments ?? []).some(
        (assignment) =>
          assignment.participantId === participantId &&
          !(
            drawDefinition.drawId === releasedSeat.drawId &&
            structure.structureId === releasedSeat.structureId &&
            assignment.drawPosition === releasedSeat.drawPosition
          ),
      ),
    ),
  );
}

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
  const refusal = groupEntryDestructionError({ tournamentRecord, participantId, event });
  if (refusal) return refusal;

  // both are present: `groupEntryDestructionError` refused otherwise
  const tournamentParticipants = tournamentRecord.participants ?? [];
  const participant = tournamentParticipants.find((p) => p.participantId === participantId) as Participant;
  const entry = (event.entries ?? []).find((entry) => entry.participantId === participantId) as Entry;

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
