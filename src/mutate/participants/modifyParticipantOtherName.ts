import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getTopics } from '@Global/state/globalState';

// constants
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

// NOTE: this method and `modifyParticipant` write the same field under DIFFERENT contracts.
// `modifyParticipant` treats '' as "clear" and DELETES the key, ignores a non-string, and
// leaves the field untouched on `undefined`. This one assigns whatever it is given, so ''
// stores a falsy value and a missing argument stores `undefined` — the published behaviour
// its test pins ("participantOtherName can be undefined"). Clearing is therefore only
// available through `modifyParticipant`. Aligning the two is a published behaviour change
// and wants its own migration entry; it is deliberately not done here.
export function modifyParticipantOtherName({ tournamentRecord, participantId, participantOtherName }) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  const { participant } = findTournamentParticipant({
    tournamentRecord,
    participantId,
  });
  if (!participant) return { error: PARTICIPANT_NOT_FOUND };

  participant.participantOtherName = participantOtherName;

  const { topics } = getTopics();
  if (topics.includes(MODIFY_PARTICIPANTS)) {
    modifyParticipantsNotice({
      tournamentId: tournamentRecord.tournamentId,
      participants: [participant],
    });
  }

  return { ...SUCCESS };
}
