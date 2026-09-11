import { getParticipants } from '@Query/participants/getParticipants';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getParticipantId } from '@Functions/global/extractors';
import { addExtension } from '@Mutate/extensions/addExtension';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';

// constants and types
import { MISSING_PARTICIPANT_ID, PARTICIPANT_NOT_FOUND, ErrorType } from '@Constants/errorConditionConstants';
import { Extension, Penalty, PenaltyTypeUnion, Tournament } from '@Types/tournamentTypes';
import { TOURNAMENT_RECORD, PENALTY_TYPE } from '@Constants/attributeConstants';
import penaltyTemplate from '@Assemblies/generators/templates/penaltyTemplate';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
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
  /**
   * ISO string recording when the penalty record was created at its ORIGIN, as
   * opposed to when this instance wrote it. Defaults to `issuedAt`, then to now.
   */
  occurredAt?: string;
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
  occurredAt,
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

  // A penalty already carries `issuedAt` — when it was handed down on court.
  // `createdAt` is when the record was written, and defaulting it to `issuedAt`
  // keeps the two coherent for a penalty captured courtside and synced later.
  // Falls back to now when the caller supplied neither, so existing callers are
  // unaffected. This is the field a governing body reads on appeal.
  const createdAt = occurredAt ?? issuedAt ?? new Date().toISOString();
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

  modifyParticipantsNotice({
    tournamentId: tournamentRecord!.tournamentId,
    participants: relevantParticipants,
  });

  return { ...SUCCESS, penaltyId: penaltyItem.penaltyId };
}
