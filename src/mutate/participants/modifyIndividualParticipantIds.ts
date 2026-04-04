import { removeIndividualParticipantIds } from './removeIndividualParticipantIds';
import { decorateResult } from '@Functions/global/decorateResult';
import { addIndividualParticipantIds } from './addIndividualParticipantIds';
import { addNotice, getTopics } from '@Global/state/globalState';

import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import {
  INVALID_PARTICIPANT_IDS,
  INVALID_PARTICIPANT_TYPE,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';
import { GROUP, INDIVIDUAL, TEAM } from '@Constants/participantConstants';

/**
 *
 * @param {object} tournamentRecord - passed in automatically by tournamentEngine
 * @param {string} groupingParticipantId - grouping participant to which participantIds are to be added
 * @param {string[]} individualParticipantIds - new value for individualParticipantIds array
 *
 */
export function modifyIndividualParticipantIds({ individualParticipantIds, groupingParticipantId, tournamentRecord }) {
  const stack = 'modifyIndividualParticipantIds';
  if (!tournamentRecord)
    return decorateResult({
      result: { error: MISSING_TOURNAMENT_RECORD },
      stack,
    });
  if (!groupingParticipantId || !individualParticipantIds)
    return decorateResult({ result: { error: MISSING_VALUE }, stack });

  const tournamentParticipants = tournamentRecord.participants ?? [];

  const groupingParticipant = tournamentParticipants.find((participant) => {
    return participant.participantId === groupingParticipantId;
  });
  if (!groupingParticipant) return decorateResult({ result: { error: PARTICIPANT_NOT_FOUND }, stack });

  if (![TEAM, GROUP].includes(groupingParticipant.participantType)) {
    return decorateResult({
      result: { error: INVALID_PARTICIPANT_TYPE },
      context: {
        participantType: groupingParticipant.participantType,
      },
      stack,
    });
  }

  // integrity chck to ensure only individuals can be added to groupings
  const invalidParticipantIds = individualParticipantIds.filter((participantId) => {
    const participant = tournamentParticipants.find(
      (tournamentParticipant) => tournamentParticipant.participantId === participantId,
    );
    return participant?.participantType !== INDIVIDUAL;
  });
  if (invalidParticipantIds.length)
    return decorateResult({
      result: { error: INVALID_PARTICIPANT_IDS, invalidParticipantIds },
      stack,
    });

  const existingIndividualParticipantIds = groupingParticipant.individualParticipantIds ?? [];

  const individualParticipantIdsToAdd = individualParticipantIds.filter((participantId) => {
    return !existingIndividualParticipantIds.includes(participantId);
  });

  const individualParticipantIdsToRemove = existingIndividualParticipantIds.filter((participantId) => {
    return !individualParticipantIds.includes(participantId);
  });

  const addResult = addIndividualParticipantIds({
    individualParticipantIds: individualParticipantIdsToAdd,
    groupingParticipantId,
    tournamentRecord,
  });
  if (addResult.error) return decorateResult({ result: addResult, stack });

  const removeResult = removeIndividualParticipantIds({
    individualParticipantIds: individualParticipantIdsToRemove,
    groupingParticipantId,
    tournamentRecord,
  });
  if (removeResult.error) return decorateResult({ result: removeResult, stack });

  const { topics } = getTopics();
  if (topics.includes(MODIFY_PARTICIPANTS)) {
    const updatedParticipant = tournamentParticipants.find(
      ({ participantId }) => participantId === groupingParticipantId,
    );

    addNotice({
      topic: MODIFY_PARTICIPANTS,
      payload: {
        tournamentId: tournamentRecord.tournamentId,
        participants: [updatedParticipant],
      },
    });
  }

  return { ...addResult, ...removeResult };
}
