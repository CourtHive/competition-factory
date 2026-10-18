import { normalizePenaltyType } from '@Query/participants/normalizePenaltyType';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { Penalty, Tournament } from '@Types/tournamentTypes';

type GetTournamentPenaltiesArgs = {
  tournamentRecord: Tournament;
};

/**
 * Every penalty issued in the tournament, once each, with the `participantIds` it was issued to.
 *
 * `penaltyType` is returned as its CODE (CA, 2026-10-18): a record written before 7.x may still store a display label
 * (`'Ball Abuse'`), and migration is opt-in, so a legacy label is normalised in the RESULT. The record is not
 * changed; a query does not write. A value outside the legacy map is returned as stored.
 */
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
        penalties[penaltyId].participantIds.push(participantId);
      } else {
        penalties[penaltyId] = {
          ...penalty,
          penaltyType: normalizePenaltyType(penalty?.penaltyType),
          participantIds: [participantId],
        };
      }
    });
    return penalties;
  }, {});

  return { penalties: Object.values(allPenalties) };
}
