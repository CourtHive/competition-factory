import { decorateResult } from '@Functions/global/decorateResult';
import { ensureInt } from '@Tools/ensureInt';

// constants
import { ALTERNATE, DIRECT_ACCEPTANCE } from '@Constants/entryStatusConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_EVENT,
  INVALID_ENTRY_STATUS,
  MISSING_TOURNAMENT_RECORD,
  PARTICIPANT_ENTRY_NOT_FOUND,
  PARTICIPANT_NOT_FOUND_IN_STAGE,
  PARTICIPANT_NOT_ENTERED_IN_STAGE,
  INVALID_VALUES,
} from '@Constants/errorConditionConstants';

export function promoteAlternate(params) {
  const { participantId } = params;
  if (participantId && typeof participantId !== 'string') return { error: INVALID_VALUES, participantId };

  return promoteAlternates({
    ...params,
    participantIds: [participantId].filter(Boolean),
  });
}

export function promoteAlternates({
  tournamentRecord,
  drawDefinition,
  participantIds,
  stageSequence,
  stage = MAIN,
  eventId,
  event,
}) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!Array.isArray(participantIds)) return { error: INVALID_VALUES, participantIds };
  if (!event) return { error: MISSING_EVENT };
  const stack = 'promoteAlternates';

  if (event) {
    const result = promoteWithinElement({
      element: event,
      participantIds,
      stageSequence,
      stage,
    });
    if (result.error) return result;
  }

  if (drawDefinition) {
    const result = promoteWithinElement({
      element: drawDefinition,
      participantIds,
      stageSequence,
      stage,
    });
    if (result.error) {
      if (eventId) {
        // if successful promoting within the event do not fail if not found in drawDefinition.entries
        // the reasoning here is that with split draws alternates may or may not appear in drawDefinition.entries
        return decorateResult({
          context: {
            drawPromotionError: result.error,
            drawId: drawDefinition.drawId,
          },
          result: { ...SUCCESS },
          stack,
        });
      } else {
        return result;
      }
    }
  }

  return { ...SUCCESS };
}

function promoteWithinElement({ participantIds, stageSequence, element, stage }) {
  const alternates = (element.entries || []).filter((entry) => entry.entryStatus === ALTERNATE);

  const targetedEntries = (element.entries || []).filter((entry) => participantIds.includes(entry.participantId));

  // if no participantId is provided, take the alternate with the lowest entryPosition
  const alternateEntry = alternates.reduce((participantEntry, entry) => {
    const { entryPosition } = entry;
    return (
      (Number.isNaN(Number(entryPosition)) && participantEntry) ||
      ((!participantEntry || entryPosition < participantEntry.entryPosition) && entry) ||
      participantEntry
    );
  }, undefined);

  const participantEntries = targetedEntries.length ? targetedEntries : [alternateEntry].filter(Boolean);

  if (!participantEntries?.length) return { error: PARTICIPANT_ENTRY_NOT_FOUND };

  const invalidEntryStatus = participantEntries.filter(({ entryStatus }) => entryStatus !== ALTERNATE);

  if (invalidEntryStatus.length) return { error: INVALID_ENTRY_STATUS, invalidEntryStatus };

  const invalidStage = participantEntries.filter(({ entryStage }) => entryStage && entryStage !== stage);
  if (invalidStage.length) return { error: PARTICIPANT_NOT_ENTERED_IN_STAGE, invalidStage };

  const invalidStageSequence =
    stageSequence && participantEntries.filter((entry) => entry.stageSequence !== stageSequence);
  if (invalidStageSequence?.length) return { error: PARTICIPANT_NOT_FOUND_IN_STAGE, invalidStageSequence };

  for (const participantEntry of participantEntries) {
    participantEntry.entryStatus = DIRECT_ACCEPTANCE;

    // cleanUp
    const entryPosition = participantEntry?.entryPosition;

    if (!Number.isNaN(Number(entryPosition))) {
      // if promoted participant has an entryPosition, adjust all other alternates with an entryPosition higher than promoted participant
      element.entries.forEach((entry) => {
        if (entry.entryStatus === ALTERNATE && entry.entryPosition > entryPosition) {
          entry.entryPosition = entry.entryPosition - 1;
        }
      });
    }

    const maxEntryPosition = Math.max(
      ...element.entries
        .filter((entry) => entry.entryStatus === DIRECT_ACCEPTANCE && !Number.isNaN(Number(entry.entryPosition)))
        .map(({ entryPosition }) => ensureInt(entryPosition || 0)),
      0,
    );
    participantEntry.entryPosition = maxEntryPosition || 0;
  }

  return { ...SUCCESS };
}
