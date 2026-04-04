import { getAssignedParticipantIds } from '@Query/drawDefinition/getAssignedParticipantIds';
import { decorateResult } from '@Functions/global/decorateResult';
import { refreshEntryPositions } from './refreshEntryPositions';
import { getParticipantId } from '@Functions/global/extractors';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { intersection } from '@Tools/arrays';
import { isString } from '@Tools/objects';

// Constants
import { EntryStatusUnion, Event, StageTypeUnion, Tournament } from '@Types/tournamentTypes';
import { HydratedParticipant } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_EVENT,
  EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT,
  ErrorType,
  INVALID_PARTICIPANT_ID,
} from '@Constants/errorConditionConstants';

type RemoveEventEntriesArgs = {
  tournamentParticipants?: HydratedParticipant[];
  entryStatuses?: EntryStatusUnion[];
  tournamentRecord?: Tournament;
  autoEntryPositions?: boolean;
  participantIds: string[];
  stage?: StageTypeUnion;
  event: Event;
};
export function removeEventEntries({
  autoEntryPositions = true,
  participantIds = [],
  entryStatuses,
  stage,
  event,
}: RemoveEventEntriesArgs): {
  participantIdsRemoved?: string[];
  success?: boolean;
  error?: ErrorType;
} {
  const stack = 'removeEventEntries';
  if (!event?.eventId) return { error: MISSING_EVENT };

  if (!Array.isArray(participantIds) || participantIds.some((participantId) => !isString(participantId))) {
    return decorateResult({ result: { error: INVALID_PARTICIPANT_ID }, stack });
  }

  // do not filter by stages; must kmow all participantIds assigned to any stage!
  const assignedParticipantIds = (event.drawDefinitions ?? []).flatMap(
    (drawDefinition) => getAssignedParticipantIds({ drawDefinition }).assignedParticipantIds ?? [],
  );

  const statusParticipantIds = (
    (entryStatuses?.length &&
      event.entries?.filter((entry) => entry.entryStatus && entryStatuses.includes(entry.entryStatus))) ||
    []
  )
    .map(getParticipantId)
    .filter((participantId) => !assignedParticipantIds.includes(participantId));

  const stageParticipantIds = (
    (stage && event.entries?.filter((entry) => entry.entryStage && entry.entryStage === stage)) ||
    []
  )
    .map(getParticipantId)
    .filter((participantId) => !assignedParticipantIds.includes(participantId));

  if (participantIds.length) {
    participantIds = participantIds.filter(
      (participantId) =>
        (!entryStatuses?.length || statusParticipantIds.includes(participantId)) &&
        (!stage || stageParticipantIds.includes(participantId)),
    );
  } else if (statusParticipantIds.length && stageParticipantIds.length) {
    participantIds = intersection(statusParticipantIds, stageParticipantIds);
  } else if (statusParticipantIds.length) {
    participantIds = statusParticipantIds;
  } else if (stageParticipantIds.length) {
    participantIds = stageParticipantIds;
  }

  if (
    participantIds?.length &&
    assignedParticipantIds.some((participantId) => participantIds.includes(participantId))
  ) {
    return decorateResult({
      result: { error: EXISTING_PARTICIPANT_DRAW_POSITION_ASSIGNMENT },
      stack,
    });
  }

  if (!participantIds?.length) return { ...SUCCESS, participantIdsRemoved: [] };

  const participantIdsRemoved: string[] = [];

  event.entries = (event.entries ?? []).filter((entry) => {
    const keepEntry = !participantIds.includes(entry?.participantId);
    if (!keepEntry) participantIdsRemoved.push(entry.participantId);
    return keepEntry;
  });

  if (autoEntryPositions) {
    event.entries = refreshEntryPositions({
      entries: event.entries,
    });
  }

  // also remove entry from all flights and drawDefinitions
  const { flightProfile } = getFlightProfile({ event });
  flightProfile?.flights?.forEach((flight) => {
    flight.drawEntries = (flight.drawEntries ?? []).filter((entry) => !participantIds.includes(entry.participantId));
  });

  event.drawDefinitions?.forEach((drawDefinition) => {
    drawDefinition.entries = (drawDefinition.entries ?? []).filter(
      (entry) => !participantIds.includes(entry.participantId),
    );
  });

  return { ...SUCCESS, participantIdsRemoved };
}
