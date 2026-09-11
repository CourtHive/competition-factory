import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getTimeItem } from '../base/timeItems';

import { PAYMENT_STATUS, paymentStatusValues, PaymentStatusUnion } from '@Constants/participantConstants';
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';

export function getParticipantPaymentStatus({ tournamentRecord, participantId }) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  const { participant } = findTournamentParticipant({
    tournamentRecord,
    participantId,
  });

  if (!participant) return { error: PARTICIPANT_NOT_FOUND };

  const { timeItem } = getTimeItem({
    itemType: PAYMENT_STATUS,
    element: participant,
  });

  if (timeItem && paymentStatusValues.includes(timeItem.itemValue as PaymentStatusUnion)) {
    return timeItem.itemValue as PaymentStatusUnion;
  }
  return undefined;
}
