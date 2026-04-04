import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice } from '@Global/state/globalState';

import penaltyTemplate from '@Assemblies/generators/templates/penaltyTemplate';
import { TOURNAMENT_RECORD, PENALTY_ID } from '@Constants/attributeConstants';
import { Participant, Penalty, Tournament } from '@Types/tournamentTypes';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  PENALTY_NOT_FOUND,
  NO_VALID_ATTRIBUTES,
  INVALID_VALUES,
  ErrorType,
  MISSING_TOURNAMENT_RECORDS,
} from '@Constants/errorConditionConstants';

export function modifyPenalty(params) {
  const { tournamentRecords } = params;
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = penaltyModify({ ...params, tournamentRecord });
    if (result.error && result.error !== PENALTY_NOT_FOUND) return result;
    if (result.success) return result;
  }

  return { error: PENALTY_NOT_FOUND };
}

type ModifyPenaltyArgs = {
  tournamentRecord: Tournament;
  modifications: { [key: string]: any };
  penaltyId;
  string;
};

function penaltyModify({ tournamentRecord, modifications, penaltyId }: ModifyPenaltyArgs): {
  modifications?: any;
  error?: ErrorType;
  success?: boolean;
  penalty?: Penalty;
} {
  const paramsCheck = requireParams({ tournamentRecord, penaltyId }, [TOURNAMENT_RECORD, PENALTY_ID]);
  if (paramsCheck.error) return paramsCheck;
  if (!modifications) return { error: INVALID_VALUES, modifications };

  const participants = tournamentRecord?.participants ?? [];

  const validAttributes = Object.keys(penaltyTemplate()).filter((attribute) => attribute !== 'penaltyId');

  const validModificationAttributes = Object.keys(modifications).filter((attribute) =>
    validAttributes.includes(attribute),
  );

  if (!validModificationAttributes.length) return { error: NO_VALID_ATTRIBUTES };

  let updatedPenalty;
  const modifiedParticipants: Participant[] = [];
  participants.forEach((participant) => {
    let participantModified = false;
    participant.penalties = (participant.penalties ?? []).map((penalty) => {
      if (penalty.penaltyId === penaltyId) {
        participantModified = true;
        validModificationAttributes.forEach((attribute) =>
          Object.assign(penalty, { [attribute]: modifications[attribute] }),
        );

        updatedPenalty ??= penalty;
      }

      return penalty;
    });
    if (participantModified) modifiedParticipants.push(participant);
  });

  if (updatedPenalty) {
    addNotice({
      topic: MODIFY_PARTICIPANTS,
      payload: {
        tournamentId: tournamentRecord.tournamentId,
        participants: modifiedParticipants,
      },
    });
  }

  return updatedPenalty ? { ...SUCCESS, penalty: updatedPenalty } : { error: PENALTY_NOT_FOUND };
}
