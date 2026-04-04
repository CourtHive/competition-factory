import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice } from '@Global/state/globalState';

import { PENALTY_NOT_FOUND, ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, PENALTY_ID } from '@Constants/attributeConstants';
import { Participant, Penalty, Tournament } from '@Types/tournamentTypes';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function removePenalty(params) {
  const { tournamentRecords } = params;
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = penaltyRemove({ ...params, tournamentRecord });
    if (result.error && result.error !== PENALTY_NOT_FOUND) return result;
  }

  return { ...SUCCESS };
}

type RemovePenaltyArgs = {
  tournamentRecord: Tournament;
  penaltyId: string;
};
function penaltyRemove({ tournamentRecord, penaltyId }: RemovePenaltyArgs): {
  error?: ErrorType;
  success?: boolean;
  penalty?: Penalty;
} {
  const paramsCheck = requireParams({ tournamentRecord, penaltyId }, [TOURNAMENT_RECORD, PENALTY_ID]);
  if (paramsCheck.error) return paramsCheck;

  const participants = tournamentRecord?.participants ?? [];
  const modifiedParticipants: Participant[] = [];

  let penaltyRemoved = false;
  let removedPenalty;
  participants.forEach((participant) => {
    let participantModified = false;
    participant.penalties = (participant.penalties ?? []).filter((penalty) => {
      if (penalty.penaltyId === penaltyId) {
        participantModified = true;
        if (!penaltyRemoved) {
          removedPenalty = penalty;
          penaltyRemoved = true;
        }
      }
      if (participantModified) modifiedParticipants.push(participant);
      return penalty.penaltyId !== penaltyId;
    });
  });

  if (removedPenalty) {
    addNotice({
      topic: MODIFY_PARTICIPANTS,
      payload: {
        tournamentId: tournamentRecord.tournamentId,
        participants: modifiedParticipants,
      },
    });
  }

  return removedPenalty ? { ...SUCCESS, penalty: removedPenalty } : { error: PENALTY_NOT_FOUND };
}
