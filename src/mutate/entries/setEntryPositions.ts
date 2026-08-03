import { modifyEventEntriesNotice, modifyDrawEntriesNotice } from '@Mutate/notifications/entriesNotifications';
import { requireParams } from '@Helpers/parameters/requireParams';
import { refreshEntryPositions } from './refreshEntryPositions';

// constants
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function setEntryPosition({
  tournamentRecord,
  drawDefinition,
  participantId,
  entryPosition,
  skipRefresh,
  event,
}) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  if (entryPosition !== undefined && !Number.isSafeInteger(entryPosition))
    return { error: INVALID_VALUES, entryPosition };

  (event?.entries ?? []).forEach((entry) => {
    if (entry.participantId === participantId) {
      entry.entryPosition = entryPosition;
    }
  });

  (drawDefinition?.entries ?? []).forEach((entry) => {
    if (entry.participantId === participantId) {
      entry.entryPosition = entryPosition;
    }
  });

  // if there are other entries with equivalent entryPosition, incremnt to differentiate
  // decimal values will be replaced with whole numbers by refreshEntryPositions()
  const differentiateDuplicates = (obj) => {
    obj.entries.forEach((entry) => {
      if (entry.entryPosition === entryPosition && entry.participantId !== participantId) {
        entry.entryPosition += 0.1;
      }
    });
  };

  if (!skipRefresh) {
    const tournamentId = tournamentRecord?.tournamentId;
    if (event?.entries) {
      differentiateDuplicates(event);
      event.entries = refreshEntryPositions({ entries: event.entries });
      // entryPosition values on event.entries changed — cover it.
      modifyEventEntriesNotice({ event, tournamentId });
    }
    if (drawDefinition?.entries) {
      differentiateDuplicates(drawDefinition);
      drawDefinition.entries = refreshEntryPositions({
        entries: drawDefinition.entries,
      });
      modifyDrawEntriesNotice({ drawDefinition, tournamentId, eventId: event?.eventId });
    }
  }

  return { ...SUCCESS };
}

export function setEntryPositions({ tournamentRecord, entryPositions, drawDefinition, event }) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!Array.isArray(entryPositions)) return { error: INVALID_VALUES };

  for (const positioning of entryPositions) {
    const { participantId, entryPosition } = positioning;
    const result = setEntryPosition({
      skipRefresh: true, // avoid redundant processing
      tournamentRecord,
      drawDefinition,
      participantId,
      entryPosition,
      event,
    });
    if (result.error) return result;
  }

  const tournamentId = tournamentRecord?.tournamentId;
  if (event?.entries) {
    event.entries = refreshEntryPositions({ entries: event.entries });
    modifyEventEntriesNotice({ event, tournamentId });
  }
  if (drawDefinition?.entries) {
    drawDefinition.entries = refreshEntryPositions({
      entries: drawDefinition.entries,
    });
    modifyDrawEntriesNotice({ drawDefinition, tournamentId, eventId: event?.eventId });
  }

  return { ...SUCCESS };
}
