import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { participantScaleItem } from './participantScaleItem';

// constants and types
import { ErrorType, MISSING_PARTICIPANT_ID, PARTICIPANT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { ScaleAttributes, ScaleItem, TournamentRecords } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';

type GetParticipantScaleItemArgs = {
  tournamentRecords?: TournamentRecords;
  scaleAttributes: ScaleAttributes;
  tournamentRecord?: Tournament;
  participantId: string;
};
export function getParticipantScaleItem(params: GetParticipantScaleItemArgs): {
  tournamentId?: string;
  scaleItem?: ScaleItem;
  error?: ErrorType;
} {
  const { tournamentRecord, scaleAttributes, participantId } = params;

  const tournamentRecords =
    params.tournamentRecords ||
    (tournamentRecord && {
      [tournamentRecord.tournamentId]: tournamentRecord,
    }) ||
    {};

  if (!participantId) return { error: MISSING_PARTICIPANT_ID };

  const { participant, tournamentId } = findTournamentParticipant({
    tournamentRecords,
    tournamentRecord,
    participantId,
  });

  if (!participant) return { error: PARTICIPANT_NOT_FOUND };
  return {
    ...participantScaleItem({ participant, scaleAttributes }),
    tournamentId,
  };
}
