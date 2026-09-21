import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { isClearRequest } from '@Mutate/participants/isClearRequest';
import { isString } from '@Tools/objects';
import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getTopics } from '@Global/state/globalState';

// constants
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function modifyParticipantOtherName({ tournamentRecord, participantId, participantOtherName }) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  const { participant } = findTournamentParticipant({
    tournamentRecord,
    participantId,
  });
  if (!participant) return { error: PARTICIPANT_NOT_FOUND };

  // Same contract as `modifyParticipant`: '' clears and DELETES the key, a non-string is
  // ignored, and `undefined` leaves the stored value untouched. This method previously assigned
  // whatever it was given, so '' stored a falsy value and a missing argument OVERWROTE the stored
  // value with `undefined` — two published methods disagreeing about one field.
  if (isClearRequest(participantOtherName)) {
    delete participant.participantOtherName;
  } else if (isString(participantOtherName)) {
    participant.participantOtherName = participantOtherName;
  }

  const { topics } = getTopics();
  if (topics.includes(MODIFY_PARTICIPANTS)) {
    modifyParticipantsNotice({
      tournamentId: tournamentRecord.tournamentId,
      participants: [participant],
    });
  }

  return { ...SUCCESS };
}
