import { decorateResult } from '@Functions/global/decorateResult';
import { getParticipantId } from '@Functions/global/extractors';

// types and constants
import { INVALID_PARTICIPANT_ID, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { EntryStatusUnion } from '@Types/tournamentTypes';
import { MAIN } from '@Constants/drawDefinitionConstants';
import { ResultType } from '@Types/factoryTypes';

export function getParticipantIds(params): ResultType & { participantIds?: string[] } {
  let { participantIds } = params;
  // When a targetStage is provided (e.g., the structure being generated), only include
  // entries for that stage. Entries without an entryStage default to MAIN.
  const targetStage = params.targetStage;
  const enteredParticipantIds =
    params.drawDefinition?.entries
      ?.filter((entry) => {
        const entryStatus = entry.entryStatus as EntryStatusUnion;
        if (params.restrictEntryStatus && !STRUCTURE_SELECTED_STATUSES.includes(entryStatus)) return false;
        if (targetStage) {
          const entryStage = entry.entryStage ?? MAIN;
          if (entryStage !== targetStage) return false;
        }
        return true;
      })
      .map(getParticipantId) ?? [];

  if (participantIds) {
    // ensure all participantIds are in drawDefinition.entries
    const invalidParticipantIds = participantIds.filter(
      (participantId) => !enteredParticipantIds?.includes(participantId),
    );

    if (invalidParticipantIds?.length)
      return decorateResult({
        result: { error: INVALID_PARTICIPANT_ID },
        info: { invalidParticipantIds },
      });
  } else {
    participantIds = enteredParticipantIds;
  }

  if (
    params.roundsCount &&
    params.restrictRoundsCount !== false &&
    params.roundsCount > participantIds.length - 1 &&
    (!params.enableDoubleRobin || params.roundsCount > (participantIds.length - 1) * 2)
  ) {
    return { error: INVALID_VALUES, info: 'Not enough participants for roundsCount' };
  }

  if (params.roundsCount && params.restrictRoundsCount !== false && params.roundsCount > 31) {
    return { error: INVALID_VALUES, info: 'roundsCount must be less than 32' };
  }

  return { participantIds };
}
