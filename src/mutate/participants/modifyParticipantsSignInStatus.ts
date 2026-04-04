import { addParticipantTimeItem } from '../timeItems/addTimeItem';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice, getTopics } from '@Global/state/globalState';
import { getParticipantId } from '@Functions/global/extractors';

import { INVALID_VALUES, MISSING_PARTICIPANTS, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SIGNED_IN, SIGNED_OUT, SIGN_IN_STATUS } from '@Constants/participantConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { Participant } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

export function modifyParticipantsSignInStatus({ tournamentRecord, participantIds, signInState }) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!Array.isArray(participantIds)) return { error: MISSING_VALUE };

  const validSignInState = [SIGNED_IN, SIGNED_OUT].includes(signInState);
  if (!validSignInState) return { error: INVALID_VALUES, signInState };

  const participants = tournamentRecord.participants ?? [];
  if (!participants.length) return { error: MISSING_PARTICIPANTS };

  const allParticipantIds = participants.map(getParticipantId);
  const invalidParticipantIds = participantIds.filter((participantId) => !allParticipantIds.includes(participantId));
  if (invalidParticipantIds.length) return { error: INVALID_VALUES, context: { invalidParticipantIds } };

  const modifiedParticipants: Participant[] = [];
  const createdAt = new Date().toISOString();
  for (const participant of participants) {
    const { participantId } = participant;
    if (participantIds.includes(participantId)) {
      const timeItem = {
        itemType: SIGN_IN_STATUS,
        itemValue: signInState,
        createdAt,
      };
      const result = addParticipantTimeItem({
        duplicateValues: false,
        tournamentRecord,
        participantId,
        timeItem,
      });
      if (result.error) return result;
      modifiedParticipants.push(participant);
    }
  }

  const { topics } = getTopics();
  if (modifiedParticipants.length && topics.includes(MODIFY_PARTICIPANTS)) {
    addNotice({
      topic: MODIFY_PARTICIPANTS,
      payload: {
        tournamentId: tournamentRecord.tournamentId,
        participants: modifiedParticipants,
      },
    });
  }

  return { ...SUCCESS };
}
