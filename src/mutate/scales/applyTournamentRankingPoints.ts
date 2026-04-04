import { setParticipantScaleItem } from '@Mutate/participants/scaleItems/addScaleItems';
import { getTournamentPoints } from '@Query/scales/getTournamentPoints';

import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { ParticipantFilters, PolicyDefinitions, ScaleItem } from '@Types/factoryTypes';
import { RANKING } from '@Constants/scaleConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

type ApplyTournamentRankingPointsArgs = {
  tournamentRecord: Tournament;
  policyDefinitions?: PolicyDefinitions;
  participantFilters?: ParticipantFilters;
  scaleName?: string;
  level?: number;
  removePriorValues?: boolean;
};

export function applyTournamentRankingPoints({
  tournamentRecord,
  policyDefinitions,
  participantFilters,
  scaleName = 'RANKING_POINTS',
  level,
  removePriorValues,
}: ApplyTournamentRankingPointsArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  // Step 1: Compute all tournament points
  const pointsResult = getTournamentPoints({
    tournamentRecord,
    policyDefinitions,
    participantFilters,
    level,
  });

  if (pointsResult.error) return pointsResult;

  const { personPoints, pairPoints, teamPoints } = pointsResult;

  // Step 2: Build personId → participantId map
  const personToParticipantMap: Record<string, string> = {};
  for (const participant of tournamentRecord.participants ?? []) {
    if (participant.person?.personId) {
      personToParticipantMap[participant.person.personId] = participant.participantId;
    }
  }

  const scaleDate = tournamentRecord.endDate;
  let modificationsApplied = 0;

  // Step 3: Write scaleItems per personId, grouped by eventType
  for (const [personId, awards] of Object.entries(personPoints as Record<string, any[]>)) {
    const participantId = personToParticipantMap[personId];
    if (!participantId) continue;

    // Group awards by eventType
    const byEventType: Record<string, any[]> = {};
    for (const award of awards) {
      const et = award.eventType || 'SINGLES';
      if (!byEventType[et]) byEventType[et] = [];
      byEventType[et].push(award);
    }

    for (const [eventType, eventAwards] of Object.entries(byEventType)) {
      const totalPoints = eventAwards.reduce(
        (sum, a) => sum + (a.points || 0) + (a.qualityWinPoints || 0) + (a.linePoints || 0),
        0,
      );

      const scaleItem: ScaleItem = {
        scaleType: RANKING,
        scaleName,
        eventType: eventType as ScaleItem['eventType'],
        scaleDate,
        scaleValue: { points: totalPoints, awards: eventAwards },
      };

      const writeResult = setParticipantScaleItem({
        tournamentRecord,
        participantId,
        scaleItem,
        removePriorValues,
      });

      if (writeResult.error) return writeResult;
      modificationsApplied++;
    }
  }

  return {
    ...SUCCESS,
    personPoints,
    pairPoints,
    teamPoints,
    modificationsApplied,
  };
}
