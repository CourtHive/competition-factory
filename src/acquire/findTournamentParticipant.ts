import { ErrorType, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { Participant, Tournament } from '@Types/tournamentTypes';
import { TournamentRecords } from '@Types/factoryTypes';

type FindTournamentParticipantArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  participantId: string;
};

export function findTournamentParticipant(params: FindTournamentParticipantArgs): {
  participant?: Participant;
  tournamentId?: string;
  error?: ErrorType;
} {
  const { tournamentRecord, participantId } = params;

  const tournamentRecords =
    params.tournamentRecords ??
    (tournamentRecord && {
      [tournamentRecord.tournamentId]: tournamentRecord,
    }) ??
    {};

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const participant = tournamentRecord.participants?.find(
      (participant) => participant.participantId === participantId,
    );
    if (participant) return { participant, tournamentId: tournamentRecord.tournamentId };
  }

  return { error: PARTICIPANT_NOT_FOUND };
}
