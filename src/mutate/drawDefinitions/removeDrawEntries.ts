import { getAssignedParticipantIds } from '@Query/drawDefinition/getAssignedParticipantIds';
import { modifyDrawEntriesNotice } from '@Mutate/notifications/entriesNotifications';
import { refreshEntryPositions } from '../entries/refreshEntryPositions';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { overlap } from '@Tools/arrays';

import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_EVENT,
  MISSING_PARTICIPANT_IDS,
  MISSING_DRAW_ID,
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
} from '@Constants/errorConditionConstants';

export function removeDrawEntries({
  autoEntryPositions = true,
  tournamentRecord,
  participantIds,
  drawDefinition,
  disableNotice,
  drawId,
  stages,
  event,
}) {
  if (!event) return { error: MISSING_EVENT };
  if (!drawId) return { error: MISSING_DRAW_ID };
  if (!participantIds?.length) return { error: MISSING_PARTICIPANT_IDS };

  const assignedParticipantIds =
    getAssignedParticipantIds({
      drawDefinition,
      stages,
    }).assignedParticipantIds ?? [];
  const someAssignedParticipantIds = overlap(assignedParticipantIds, participantIds);

  if (someAssignedParticipantIds) return { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT };

  const filterEntry = (entry) => {
    const entryId = entry.participantId;
    return !participantIds.includes(entryId);
  };

  const { flightProfile } = getFlightProfile({ event });
  const flight = flightProfile?.flights?.find((flight) => flight.drawId === drawId);
  if (flight?.drawEntries) {
    flight.drawEntries = flight.drawEntries.filter(filterEntry);
    if (autoEntryPositions) {
      flight.drawEntries = refreshEntryPositions({
        entries: flight.drawEntries,
      });
    }
  }

  if (drawDefinition?.entries) {
    const before = drawDefinition.entries.length;
    drawDefinition.entries = drawDefinition.entries.filter(filterEntry);
    if (autoEntryPositions) {
      drawDefinition.entries = refreshEntryPositions({
        entries: drawDefinition.entries,
      });
    }
    if (!disableNotice && drawDefinition.entries.length !== before) {
      modifyDrawEntriesNotice({
        drawDefinition,
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event?.eventId,
      });
    }
  }

  return { ...SUCCESS };
}
