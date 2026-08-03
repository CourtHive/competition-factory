import { addParticipantTimeItem } from '../timeItems/addTimeItem';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice, getTopics } from '@Global/state/globalState';
import { getParticipantId } from '@Functions/global/extractors';

import { INVALID_VALUES, MISSING_PARTICIPANTS, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { PAYMENT_STATUS, paymentStatusValues, PaymentStatusUnion } from '@Constants/participantConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { Participant } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type ModifyParticipantsPaymentStatusArgs = {
  tournamentRecord: any;
  participantIds: string[];
  paymentState: PaymentStatusUnion;
};

export function modifyParticipantsPaymentStatus({
  tournamentRecord,
  participantIds,
  paymentState,
}: ModifyParticipantsPaymentStatusArgs) {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!Array.isArray(participantIds)) return { error: MISSING_VALUE };

  if (!paymentStatusValues.includes(paymentState)) return { error: INVALID_VALUES, paymentState };

  const participants = tournamentRecord.participants ?? [];
  if (!participants.length) return { error: MISSING_PARTICIPANTS };

  const allParticipantIds = new Set(participants.map(getParticipantId));
  const invalidParticipantIds = participantIds.filter((participantId) => !allParticipantIds.has(participantId));
  if (invalidParticipantIds.length) return { error: INVALID_VALUES, context: { invalidParticipantIds } };

  const modifiedParticipants: Participant[] = [];
  const createdAt = new Date().toISOString();
  for (const participant of participants) {
    const { participantId } = participant;
    if (participantIds.includes(participantId)) {
      const timeItem = {
        itemType: PAYMENT_STATUS,
        itemValue: paymentState,
        createdAt,
      };
      const result = addParticipantTimeItem({
        duplicateValues: false,
        disableNotice: true, // this fn batch-dispatches MODIFY_PARTICIPANTS below
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
