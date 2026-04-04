import { Penalty, Tournament } from '@Types/tournamentTypes';
import { ErrorType, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

type GetTournamentPenaltiesArgs = {
  tournamentRecord: Tournament;
};
export function getTournamentPenalties({ tournamentRecord }: GetTournamentPenaltiesArgs): {
  error?: ErrorType;
  penalties?: Penalty[];
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const participants = tournamentRecord?.participants ?? [];
  const allPenalties = participants.reduce((penalties, participant) => {
    const { participantId } = participant;
    (participant.penalties ?? []).forEach((penalty) => {
      const { penaltyId } = penalty ?? {};
      if (penalties[penaltyId]) {
        penalties[penaltyId].participants.push(participantId);
      } else {
        penalties[penaltyId] = {
          ...penalty,
          participantIds: [participantId],
        };
      }
    });
    return penalties;
  }, {});

  return { penalties: Object.values(allPenalties) };
}
