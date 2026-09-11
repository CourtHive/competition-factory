import { checkAndUpdateSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { deleteEventsNotice } from '@Mutate/notifications/eventNotifications';
import { deleteDrawNotice } from '@Mutate/notifications/drawNotifications';
import { addTournamentTimeItem } from '../timeItems/addTimeItem';
import { addNotice, hasTopic } from '@Global/state/globalState';

// constants
import { ARRAY, OF_TYPE, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { AUDIT, DELETE_PARTICIPANTS } from '@Constants/topicConstants';
import { UNGROUPED } from '@Constants/entryStatusConstants';
import { DELETE_EVENTS } from '@Constants/auditConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/eventConstants';

export function deleteEvents(params) {
  const paramCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORD]: true },
    { eventIds: true, [OF_TYPE]: ARRAY },
  ]);
  if (paramCheck.error) return paramCheck;

  const { removePairParticipants, tournamentRecord, eventIds } = params;

  const auditTrail: any[] = [];
  const deletedEventDetails: any[] = [];
  const deletedEventIds: string[] = [];
  const deletedDrawIds: string[] = [];

  const activePairParticipantIds: string[] = [];
  const pairParticipantIds: string[] = [];

  tournamentRecord.events = (tournamentRecord.events ?? []).filter((event) => {
    if (eventIds.includes(event.eventId)) {
      const auditData = {
        action: DELETE_EVENTS,
        payload: { events: [event] },
      };
      auditTrail.push(auditData);
      deletedEventDetails.push({
        tournamentId: tournamentRecord.tournamentId,
        eventName: event.eventName,
        eventType: event.eventType,
        category: event.category,
        eventId: event.eventId,
        gender: event.gender,
      });
    }

    const enteredPairParticipantIds =
      event.eventType === DOUBLES
        ? (event.entries ?? [])
            .map(({ entryStatus, participantId }) => entryStatus !== UNGROUPED && participantId)
            .filter(Boolean)
        : [];

    const deleteEvent = eventIds.includes(event.eventId);

    if (deleteEvent) {
      pairParticipantIds.push(...enteredPairParticipantIds);
      deletedEventIds.push(event.eventId);
      deletedDrawIds.push(...(event.drawDefinitions ?? []).map((drawDefinition) => drawDefinition.drawId));
    } else {
      activePairParticipantIds.push(...enteredPairParticipantIds);
    }

    return !deleteEvent;
  });

  const removedParticipantIds: string[] = [];
  if (removePairParticipants) {
    const particiapntIdsToRemove = new Set(
      pairParticipantIds.filter((participantId) => !activePairParticipantIds.includes(participantId)),
    );
    removedParticipantIds.push(...particiapntIdsToRemove);
    tournamentRecord.participants = tournamentRecord.participants.filter(
      ({ participantId }) => !particiapntIdsToRemove.has(participantId),
    );
  }

  // cleanup references to eventId in schedulingProfile extension
  checkAndUpdateSchedulingProfile({ tournamentRecord });

  // Cascade delete notices so external projections drop the removed subtree.
  // DELETE_EVENT + DELETED_DRAW_IDS let a consumer cascade the events' draws (and
  // their matchUps/structures/entries) via foreign keys; DELETE_PARTICIPANTS
  // covers pair participants removed with removePairParticipants.
  if (deletedEventIds.length) {
    const tournamentId = tournamentRecord.tournamentId;
    deleteEventsNotice({ tournamentId, eventIds: deletedEventIds });
    for (const drawId of deletedDrawIds) deleteDrawNotice({ tournamentId, drawId });
    if (removedParticipantIds.length) {
      addNotice({ topic: DELETE_PARTICIPANTS, payload: { tournamentId, participantIds: removedParticipantIds } });
    }
  }

  if (auditTrail.length) {
    if (hasTopic(AUDIT)) {
      const tournamentId = tournamentRecord.tournamentId;
      addNotice({ topic: AUDIT, payload: { type: DELETE_EVENTS, tournamentId, detail: auditTrail } });
    } else {
      const timeItem = {
        itemValue: deletedEventDetails,
        itemType: DELETE_EVENTS,
      };
      addTournamentTimeItem({ tournamentRecord, timeItem });
    }
  }

  return { ...SUCCESS };
}
