import { getParticipants } from '@Query/participants/getParticipants';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getParticipantId } from '@Functions/global/extractors';
import { addExtension } from '@Mutate/extensions/addExtension';
import { addNotice } from '@Global/state/globalState';

// constants and types
import { MISSING_PARTICIPANT_ID, PARTICIPANT_NOT_FOUND, ErrorType } from '@Constants/errorConditionConstants';
import { Extension, Penalty, PenaltyTypeUnion, Tournament } from '@Types/tournamentTypes';
import { TOURNAMENT_RECORD, PENALTY_TYPE } from '@Constants/attributeConstants';
import penaltyTemplate from '@Assemblies/generators/templates/penaltyTemplate';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
import { MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

type AddPenaltyArgs = {
  refereeParticipantId?: string;
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  penaltyType: PenaltyTypeUnion;
  participantIds: string[];
  extensions?: Extension[];
  penaltyCode: string;
  penaltyId?: string;
  matchUpId?: string;
  issuedAt?: string;
  notes?: string;
};

export function addPenalty(params: AddPenaltyArgs): ResultType & { penaltyId?: string } {
  const { tournamentRecord, participantIds } = params;
  const tournamentRecords =
    params.tournamentRecords ??
    (tournamentRecord && {
      [tournamentRecord.tournamentId]: tournamentRecord,
    }) ??
    {};

  let penaltyId;
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const participants =
      getParticipants({
        tournamentRecord,
      }).participants ?? [];

    const tournamentParticipantIds = participants
      ?.map(getParticipantId)
      .filter((participantId) => participantIds.includes(participantId));

    if (tournamentParticipantIds.length) {
      const result = penaltyAdd({
        ...params,
        penaltyId: params.penaltyId ?? penaltyId,
        tournamentRecord,
        participantIds: tournamentParticipantIds,
      });
      penaltyId = result.penaltyId;
    }
  }

  return penaltyId ? { ...SUCCESS, penaltyId } : { error: PARTICIPANT_NOT_FOUND };
}

function penaltyAdd({
  refereeParticipantId,
  tournamentRecord,
  participantIds,
  penaltyCode,
  penaltyType,
  extensions,
  penaltyId,
  matchUpId,
  issuedAt,
  notes,
}: AddPenaltyArgs): {
  penaltyId?: string;
  success?: boolean;
  error?: ErrorType;
} {
  const paramsCheck = requireParams({ tournamentRecord, penaltyType }, [TOURNAMENT_RECORD, PENALTY_TYPE]);
  if (paramsCheck.error) return paramsCheck;
  if (!participantIds) return { error: MISSING_PARTICIPANT_ID };

  const participants = tournamentRecord?.participants ?? [];
  const relevantParticipants = participants.filter((participant) => participantIds.includes(participant.participantId));
  if (!relevantParticipants.length) return { error: PARTICIPANT_NOT_FOUND };

  const createdAt = new Date().toISOString();
  const penaltyItem: Penalty = Object.assign(penaltyTemplate({ penaltyId }), {
    refereeParticipantId,
    penaltyCode,
    penaltyType,
    matchUpId,
    createdAt,
    issuedAt,
    notes,
  });

  if (Array.isArray(extensions)) {
    extensions.forEach((extension) => addExtension({ element: penaltyItem, extension }));
  }

  relevantParticipants.forEach((participant) => {
    participant.penalties ??= [];
    participant.penalties.push(penaltyItem);
  });

  addNotice({
    topic: MODIFY_PARTICIPANTS,
    payload: {
      tournamentId: tournamentRecord.tournamentId,
      participants: relevantParticipants,
    },
  });

  return { ...SUCCESS, penaltyId: penaltyItem.penaltyId };
}
