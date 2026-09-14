import { decorateResult } from '@Functions/global/decorateResult';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { intersection } from '@Tools/arrays';

// constants and types
import { Participant, Tournament } from '@Types/tournamentTypes';
import { PAIR } from '@Constants/participantConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  INVALID_PARTICIPANT_IDS,
  MISSING_PARTICIPANT_IDS,
  MISSING_TOURNAMENT_RECORD,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type GetPairedParticipantArgs = {
  tournamentParticipants?: any[];
  tournamentRecord?: Tournament;
  participantIds: string[];
};

export function getPairedParticipant({
  tournamentParticipants,
  tournamentRecord,
  participantIds,
}: GetPairedParticipantArgs): {
  duplicatedPairParticipants?: any[];
  participant?: Participant;
  error?: ErrorType;
  success?: boolean;
} {
  const stack = 'getPairedParticipant';

  if (!tournamentParticipants && !tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!Array.isArray(participantIds) || participantIds.length > 2) return { error: INVALID_PARTICIPANT_IDS };
  if (!participantIds.length)
    return decorateResult({
      result: { error: MISSING_PARTICIPANT_IDS },
      stack,
    });

  tournamentParticipants = tournamentParticipants ?? tournamentRecord?.participants ?? [];

  const existingPairedParticipants = tournamentParticipants.filter(
    (participant) =>
      participant.participantType === PAIR &&
      intersection(participantIds, participant.individualParticipantIds).length === participantIds.length &&
      participant.individualParticipantIds.length === participantIds.length,
  );
  const existingPairedParticipant = existingPairedParticipants[0];
  if (!existingPairedParticipant) {
    return decorateResult({ result: { error: PARTICIPANT_NOT_FOUND }, stack });
  }

  const duplicatedPairParticipants = makeDeepCopy(existingPairedParticipants.slice(1), false, true);

  return {
    participant: makeDeepCopy(existingPairedParticipant),
    duplicatedPairParticipants,
    ...SUCCESS,
  };
}
