import { definedAttributes } from '@Tools/definedAttributes';

// constants
import { MODIFY_PAIR_ASSIGNMENT, MODIFY_PAIR_ASSIGNMENT_METHOD } from '@Constants/positionActionConstants';
import { UNGROUPED, UNPAIRED } from '@Constants/entryStatusConstants';

export function getValidModifyAssignedPairAction({
  tournamentParticipants,
  returnParticipants,
  drawPosition,
  participant,
  drawId,
  event,
}) {
  // only ungrouped individuals who are event.entries are valid
  const availableIndividualParticipantIds =
    event?.entries
      ?.filter(({ entryStatus }) => [UNGROUPED, UNPAIRED].includes(entryStatus))
      .map(({ participantId }) => participantId) ?? [];

  if (availableIndividualParticipantIds.length) {
    const existingIndividualParticipantIds = participant.individualParticipantIds;

    const availableIndividualParticipants = returnParticipants
      ? tournamentParticipants.filter(({ participantId }) => availableIndividualParticipantIds.includes(participantId))
      : undefined;

    const existingIndividualParticipants = returnParticipants
      ? tournamentParticipants.filter(({ participantId }) => existingIndividualParticipantIds.includes(participantId))
      : undefined;

    const validModifyAssignedPairAction = definedAttributes(
      {
        payload: {
          participantId: participant.participantId,
          replacementIndividualParticipantId: undefined,
          existingIndividualParticipantId: undefined,
          drawPosition,
          drawId,
        },
        method: MODIFY_PAIR_ASSIGNMENT_METHOD,
        availableIndividualParticipantIds,
        availableIndividualParticipants,
        existingIndividualParticipantIds,
        existingIndividualParticipants,
        type: MODIFY_PAIR_ASSIGNMENT,
      },
      false,
      false,
      true,
    );

    return { validModifyAssignedPairAction };
  }

  return {};
}
