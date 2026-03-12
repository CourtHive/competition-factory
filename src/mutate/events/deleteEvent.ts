import { checkAndUpdateSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { addTournamentTimeItem } from '../timeItems/addTimeItem';
import { addNotice, hasTopic } from '@Global/state/globalState';

// constants
import { ARRAY, OF_TYPE, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { UNGROUPED } from '@Constants/entryStatusConstants';
import { DELETE_EVENTS } from '@Constants/auditConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { DOUBLES } from '@Constants/eventConstants';
import { AUDIT } from '@Constants/topicConstants';

export function deleteEvents(params) {
  const paramCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORD]: true },
    { eventIds: true, [OF_TYPE]: ARRAY },
  ]);
  if (paramCheck.error) return paramCheck;

  const { removePairParticipants, tournamentRecord, eventIds } = params;

  const auditTrail: any[] = [];
  const deletedEventDetails: any[] = [];

  const activePairParticipantIds: string[] = [];
  const pairParticipantIds: string[] = [];

  tournamentRecord.events = (tournamentRecord.events || []).filter((event) => {
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
        ? (event.entries || [])
            .map(({ entryStatus, participantId }) => entryStatus !== UNGROUPED && participantId)
            .filter(Boolean)
        : [];

    const deleteEvent = eventIds.includes(event.eventId);

    if (deleteEvent) {
      pairParticipantIds.push(...enteredPairParticipantIds);
    } else {
      activePairParticipantIds.push(...enteredPairParticipantIds);
    }

    return !deleteEvent;
  });

  if (removePairParticipants) {
    const particiapntIdsToRemove = new Set(
      pairParticipantIds.filter((participantId) => !activePairParticipantIds.includes(participantId)),
    );
    tournamentRecord.participants = tournamentRecord.participants.filter(
      ({ participantId }) => !particiapntIdsToRemove.has(participantId),
    );
  }

  // cleanup references to eventId in schedulingProfile extension
  checkAndUpdateSchedulingProfile({ tournamentRecord });

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
