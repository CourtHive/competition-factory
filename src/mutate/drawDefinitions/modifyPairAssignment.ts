import { modifyDrawEntriesNotice, modifyEventEntriesNotice } from '@Mutate/notifications/entriesNotifications';
import { modifyPositionAssignmentsNotice } from '@Mutate/notifications/drawNotifications';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { positionAssignmentsOf, structuresOf } from '@Acquire/structureMembers';
import { getPairedParticipant } from '@Query/participant/getPairedParticipant';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { deleteParticipants } from '@Mutate/participants/deleteParticipants';
import { addParticipant } from '@Mutate/participants/addParticipant';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { entriesKey } from '@Mutate/events/eventChangeNotice';
import { isString } from '@Tools/objects';

// constants and types
import { ERROR, EVENT, TOURNAMENT_RECORD, UUIDS, VALIDATE } from '@Constants/attributeConstants';
import { DrawDefinition, Event, PositionAssignment, Structure } from '@Types/tournamentTypes';
import { UNGROUPED, UNPAIRED } from '@Constants/entryStatusConstants';
import { COMPETITOR } from '@Constants/participantRoles';
import { PAIR } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/eventConstants';
import {
  INVALID_EVENT_TYPE,
  INVALID_PARTICIPANT,
  INVALID_PARTICIPANT_ID,
  MISSING_PARTICIPANT_ID,
} from '@Constants/errorConditionConstants';

export function modifyPairAssignment(params) {
  const paramsCheck = checkRequiredParameters(params, [
    { [EVENT]: true, [TOURNAMENT_RECORD]: true, [UUIDS]: false },
    {
      replacementIndividualParticipantId: true,
      [VALIDATE]: (value) => isString(value),
      existingIndividualParticipantId: true,
      [ERROR]: MISSING_PARTICIPANT_ID,
      participantId: true,
    },
  ]);
  const {
    replacementIndividualParticipantId,
    existingIndividualParticipantId,
    tournamentRecord,
    drawDefinition,
    participantId,
    event,
    uuids,
  } = params;
  if (paramsCheck.error) return paramsCheck;

  if (event?.eventType !== DOUBLES) return { error: INVALID_EVENT_TYPE };

  // ensure that replacementIndividualPartiicpant is UNPAIRED
  const availableIndividualParticipantIds =
    event?.entries
      ?.filter(({ entryStatus }) => [UNGROUPED, UNPAIRED].includes(entryStatus))
      .map(({ participantId }) => participantId) ?? [];
  if (!availableIndividualParticipantIds.includes(replacementIndividualParticipantId)) {
    return { error: INVALID_PARTICIPANT_ID };
  }

  const participant = (tournamentRecord.participants ?? []).find(
    (participant) => participant.participantId === participantId,
  );

  if (participant?.participantType !== PAIR) return { error: INVALID_PARTICIPANT, participant };

  const existingIndividualParticipantIds = participant.individualParticipantIds;
  const individualParticipantIds: string[] = [
    replacementIndividualParticipantId,
    ...existingIndividualParticipantIds.filter(
      (individualParticipantId) => individualParticipantId !== existingIndividualParticipantId,
    ),
  ];

  const { participant: existingPairParticipant } = getPairedParticipant({
    participantIds: individualParticipantIds,
    tournamentRecord,
  });

  // if no existing pair participant, add new pair participant
  let newPairParticipantId;
  if (!existingPairParticipant) {
    const newPairParticipant = {
      participantId: uuids?.pop(),
      participantRole: COMPETITOR,
      individualParticipantIds,
      participantType: PAIR,
    };
    const result = addParticipant({
      participant: newPairParticipant,
      returnParticipant: true,
      tournamentRecord,
    });
    if (result.error) return result;
    newPairParticipantId = result.participant.participantId;
  } else {
    newPairParticipantId = existingPairParticipant.participantId;
  }
  const tournamentId = tournamentRecord.tournamentId;
  const { flightProfile } = getFlightProfile({ event });
  if (drawDefinition) {
    // modify all positionAssignments in event, drawDefinition and flight
    const flight = flightProfile?.flights?.find(({ drawId }) => drawId === drawDefinition.drawId);
    if (flight) {
      const before = entriesKey(flight.drawEntries);
      flight.drawEntries = flight.drawEntries.map((entry) =>
        entry.participantId === participantId ? { ...entry, participantId: newPairParticipantId } : entry,
      );
      // a flight's drawEntries live in the event's flight profile: changing them modifies the event
      if (entriesKey(flight.drawEntries) !== before) modifyEventNotice({ tournamentId, event });
    }

    const drawEntriesBefore = entriesKey(drawDefinition.entries);
    drawDefinition.entries = drawDefinition.entries.map((entry) =>
      entry.participantId === participantId ? { ...entry, participantId: newPairParticipantId } : entry,
    );
    if (entriesKey(drawDefinition.entries) !== drawEntriesBefore) {
      modifyDrawEntriesNotice({ eventId: event.eventId, drawDefinition, tournamentId });
    }

    reassignPositionAssignments({ drawDefinition, participantId, newPairParticipantId, tournamentId, event });
  }

  const eventEntriesBefore = entriesKey(event.entries);
  event.entries = event.entries.map(
    (entry) =>
      // replace previous pair participantId with newPairParticipantid
      // remove replacmentIndividualParticipantId from event.entries
      (entry.participantId === participantId && {
        ...entry,
        participantId: newPairParticipantId,
      }) ||
      // add existingIndividualParticipantId removed from original PAIR to event.entries as UNGROUPED
      (entry.participantId === replacementIndividualParticipantId && {
        ...entry,
        participantId: existingIndividualParticipantId,
      }) ||
      entry,
  );
  if (entriesKey(event.entries) !== eventEntriesBefore) modifyEventEntriesNotice({ tournamentId, event });

  // if participant has no other entries then the pair can be destroyed
  const participantOtherEntries = tournamentRecord.events.some(({ entries, eventId, drawDefinitions }) => {
    if (event.eventId === eventId) {
      return drawDefinitions.some(({ drawId, entries }) =>
        drawId === drawDefinition?.drawId ? false : entries?.find((entry) => entry.participantId === participantId),
      );
    } else {
      return entries?.find((entry) => entry.participantId === participantId);
    }
  });

  if (!participantOtherEntries) {
    const result = deleteParticipants({
      addIndividualParticipantsToEvents: false,
      participantIds: [participantId],
      tournamentRecord,
    });
    if (result.error) return result;
  }

  return { ...SUCCESS, participantOtherEntries, newPairParticipantId };
}

// a structure's own positionAssignments, or those of its child structures (round robin groups)
function positionAssignmentsKey(structure: Structure) {
  return JSON.stringify([
    positionAssignmentsOf(structure),
    structuresOf(structure)?.map((subStructure) => positionAssignmentsOf(subStructure)),
  ]);
}

// replace the PAIR in every structure's positionAssignments, announcing each structure that changed
type ReassignPositionAssignmentsArgs = {
  newPairParticipantId: string;
  drawDefinition: DrawDefinition;
  participantId: string;
  tournamentId: string;
  event: Event;
};
function reassignPositionAssignments({
  newPairParticipantId,
  drawDefinition,
  participantId,
  tournamentId,
  event,
}: ReassignPositionAssignmentsArgs) {
  const swap = (assignments: PositionAssignment[]) =>
    assignments.map((assignment) =>
      assignment.participantId === participantId ? { ...assignment, participantId: newPairParticipantId } : assignment,
    );

  // update positionAssignments for all structures within the drawDefinition
  for (const structure of drawDefinition.structures ?? []) {
    const assignmentsBefore = positionAssignmentsKey(structure);
    if ('structures' in structure && structure.structures) {
      // a container holds no positionAssignments of its own (Object.assign: the 8.0.0 form types it `never`)
      Object.assign(structure, { positionAssignments: undefined });
      for (const subStructure of structure.structures) {
        if ('positionAssignments' in subStructure && subStructure.positionAssignments) {
          subStructure.positionAssignments = swap(subStructure.positionAssignments);
        }
      }
    } else if ('positionAssignments' in structure && structure.positionAssignments) {
      structure.positionAssignments = swap(structure.positionAssignments);
    }
    if (positionAssignmentsKey(structure) !== assignmentsBefore) {
      modifyPositionAssignmentsNotice({ drawDefinition, tournamentId, structure, event });
    }
  }
}
