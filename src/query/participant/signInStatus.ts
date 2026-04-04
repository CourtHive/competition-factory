import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getTimeItem } from '../base/timeItems';

import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { SIGNED_IN, SIGN_IN_STATUS } from '@Constants/participantConstants';
import { PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';

export function getParticipantSignInStatus({ tournamentRecord, participantId }) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  const { participant } = findTournamentParticipant({
    tournamentRecord,
    participantId,
  });

  if (!participant) return { error: PARTICIPANT_NOT_FOUND };

  const { timeItem } = getTimeItem({
    itemType: SIGN_IN_STATUS,
    element: participant,
  });

  return timeItem && timeItem.itemValue === SIGNED_IN && SIGNED_IN;
}
