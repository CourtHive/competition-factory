import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { isClearRequest } from '@Mutate/participants/isClearRequest';
import { requireParams } from '@Helpers/parameters/requireParams';
import { isString } from '@Tools/objects';

// constants
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
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

  // announced (and so factory-stamped) whether or not anything subscribes: gated on the subscription, the stored
  // record depended on who was listening
  modifyParticipantsNotice({
    tournamentId: tournamentRecord.tournamentId,
    participants: [participant],
  });

  return { ...SUCCESS };
}
