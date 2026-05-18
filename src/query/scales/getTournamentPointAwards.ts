import { getTournamentPoints } from '@Query/scales/getTournamentPoints';
import { getParticipants } from '@Query/participants/getParticipants';

import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { ParticipantFilters, PolicyDefinitions } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type GetTournamentPointAwardsArgs = {
  participantFilters?: ParticipantFilters;
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord: Tournament;
  level?: number;
};

/**
 * Pipeline-facing flat-output entry: returns a single PointAward[] with
 * tournamentId and endDate guaranteed populated on every award.
 *
 * Composes getTournamentPoints (which returns personPoints/pairPoints/
 * teamPoints maps) and flattens the maps into one array, enriching each
 * award with the source tournament's identifiers and the participant
 * lookup info needed by downstream stores. Pair-to-individual attribution
 * is handled inside getTournamentPoints per RankingPolicy.doublesAttribution;
 * pair/team awards that do not get attributed to individuals remain in
 * the flat output flagged with participantId only (no personId).
 *
 * Intended consumer: the courthive-rankings pipeline. The existing
 * getTournamentPoints / getEventRankingPoints entries are unchanged.
 */
export function getTournamentPointAwards({
  participantFilters,
  policyDefinitions,
  tournamentRecord,
  level,
}: GetTournamentPointAwardsArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const pointsResult = getTournamentPoints({
    participantFilters,
    policyDefinitions,
    tournamentRecord,
    level,
  });

  if (pointsResult.error) return pointsResult;

  const { personPoints = {}, pairPoints = {}, teamPoints = {} } = pointsResult;

  const tournamentId = tournamentRecord.tournamentId;
  const tournamentEndDate = tournamentRecord.endDate;

  const { participants = [] } = getParticipants({ tournamentRecord });
  const personToParticipant: Record<string, { participantId: string; participantName: string }> = {};
  const participantLookup: Record<string, { participantName: string; personId?: string }> = {};

  for (const p of participants as any[]) {
    participantLookup[p.participantId] = {
      participantName: p.participantName ?? '',
      personId: p.person?.personId,
    };
    if (p.person?.personId) {
      personToParticipant[p.person.personId] = {
        participantId: p.participantId,
        participantName: p.participantName ?? '',
      };
    }
  }

  const pointAwards: any[] = [];

  for (const [personId, awards] of Object.entries(personPoints as Record<string, any[]>)) {
    const participant = personToParticipant[personId];
    for (const award of awards) {
      pointAwards.push({
        ...award,
        personId,
        participantId: participant?.participantId ?? award.participantId,
        participantName: participant?.participantName,
        tournamentId: award.tournamentId ?? tournamentId,
        endDate: award.endDate ?? tournamentEndDate,
      });
    }
  }

  // Pair awards that were not attributed to individuals (no doublesAttribution
  // configured) — keep with participantId only.
  for (const [participantId, awards] of Object.entries(pairPoints as Record<string, any[]>)) {
    const info = participantLookup[participantId];
    for (const award of awards) {
      pointAwards.push({
        ...award,
        participantId,
        participantName: info?.participantName,
        tournamentId: award.tournamentId ?? tournamentId,
        endDate: award.endDate ?? tournamentEndDate,
      });
    }
  }

  // Team awards — kept at team participant level. The pipeline decides
  // whether to expand to individuals based on roster + policy.
  for (const [participantId, awards] of Object.entries(teamPoints as Record<string, any[]>)) {
    const info = participantLookup[participantId];
    for (const award of awards) {
      pointAwards.push({
        ...award,
        participantId,
        participantName: info?.participantName,
        tournamentId: award.tournamentId ?? tournamentId,
        endDate: award.endDate ?? tournamentEndDate,
      });
    }
  }

  return { pointAwards, ...SUCCESS };
}
