import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getTopics } from '@Global/state/globalState';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';

import { MISSING_VALUE, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function modifyParticipantName({ tournamentRecord, participantName, participantId }) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  if (!participantName) return { error: MISSING_VALUE, info: 'Missing participantName' };

  const { participant } = findTournamentParticipant({
    tournamentRecord,
    participantId,
  });
  if (!participant) return { error: PARTICIPANT_NOT_FOUND };

  participant.participantName = participantName;

  const { topics } = getTopics();
  if (topics.includes(MODIFY_PARTICIPANTS)) {
    modifyParticipantsNotice({
      tournamentId: tournamentRecord.tournamentId,
      participants: [participant],
    });
  }

  return { ...SUCCESS };
}
