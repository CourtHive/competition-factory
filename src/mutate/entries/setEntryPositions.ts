import { refreshEntryPositions } from './refreshEntryPositions';
import { decorateResult } from '@Functions/global/decorateResult';

// constants
import { INVALID_VALUES, MISSING_PARTICIPANT_ID, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function setEntryPosition({
  tournamentRecord,
  drawDefinition,
  participantId,
  entryPosition,
  skipRefresh,
  event,
}) {
  const stack = 'setEntryPositions';

  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!participantId) return decorateResult({ result: { error: MISSING_PARTICIPANT_ID }, stack });

  if (entryPosition !== undefined && !Number.isSafeInteger(entryPosition))
    return { error: INVALID_VALUES, entryPosition };

  (event?.entries || []).forEach((entry) => {
    if (entry.participantId === participantId) {
      entry.entryPosition = entryPosition;
    }
  });

  (drawDefinition?.entries || []).forEach((entry) => {
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
    if (event?.entries) {
      differentiateDuplicates(event);
      event.entries = refreshEntryPositions({ entries: event.entries });
    }
    if (drawDefinition?.entries) {
      differentiateDuplicates(drawDefinition);
      drawDefinition.entries = refreshEntryPositions({
        entries: drawDefinition.entries,
      });
    }
  }

  return { ...SUCCESS };
}

export function setEntryPositions({ tournamentRecord, entryPositions, drawDefinition, event }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
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

  if (event?.entries) {
    event.entries = refreshEntryPositions({ entries: event.entries });
  }
  if (drawDefinition?.entries) {
    drawDefinition.entries = refreshEntryPositions({
      entries: drawDefinition.entries,
    });
  }

  return { ...SUCCESS };
}
