import { getMatchUpDependencies } from '../matchUps/getMatchUpDependencies';
import { allTournamentMatchUps } from '../matchUps/getAllTournamentMatchUps';

import { Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { INVALID_OBJECT, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

type GetParticipantSchedulesArgs = {
  tournamentRecord: Tournament;
  participantFilters?: any;
};
export function getParticipantSchedules({ participantFilters = {}, tournamentRecord }: GetParticipantSchedulesArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  if (typeof participantFilters !== 'object') return { error: INVALID_OBJECT, context: { participantFilters } };

  const contextFilters = { eventIds: participantFilters.eventIds };
  const matchUps =
    allTournamentMatchUps({
      tournamentRecord,
      contextFilters,
    }).matchUps ?? [];

  const matchUpsMap = Object.assign({}, ...matchUps.map((matchUp) => ({ [matchUp.matchUpId]: matchUp })));

  const scheduledMatchUps = matchUps.filter(({ schedule }) => schedule && Object.keys(schedule).length);

  const sourceMatchUpIds =
    getMatchUpDependencies({
      tournamentRecord,
      matchUps,
    }).sourceMatchUpIds ?? [];

  const participantAggregator = {};
  for (const matchUp of scheduledMatchUps) {
    const { sides } = matchUp;
    let relevantSourceMatchUps;

    const participants =
      sides
        ?.map((side: any) => {
          if (side.participant) {
            return [side.participant].concat(...(side.participant.individualParticipants ?? []));
          } else if (sourceMatchUpIds[matchUp.matchUpId] && !relevantSourceMatchUps) {
            relevantSourceMatchUps = (sourceMatchUpIds[matchUp.matchUpId] ?? [])
              .map((matchUpId) => matchUpsMap[matchUpId])
              .filter(({ winningSide, bye }) => !winningSide && !bye);
          }
          return undefined;
        })
        .filter(Boolean)
        .flat() ?? [];

    for (const participant of participants) {
      const { participantId } = participant;
      if (!participantAggregator[participantId]) {
        participantAggregator[participantId] = {
          potentialMatchUps: [],
          participant,
          matchUps: [],
        };
      }

      participantAggregator[participantId].matchUps.push(matchUp);
    }

    const potentialParticipants =
      relevantSourceMatchUps
        ?.map(({ sides }) => sides)
        .flat()
        .map(({ participant }) => participant && [participant].concat(...(participant.individualParticipants ?? [])))
        .filter(Boolean)
        .flat() ?? [];

    for (const participant of potentialParticipants) {
      const { participantId } = participant;
      if (!participantAggregator[participantId]) {
        participantAggregator[participantId] = {
          potentialMatchUps: [],
          participant,
          matchUps: [],
        };
      }

      participantAggregator[participantId].potentialMatchUps.push(matchUp);
    }
  }

  const aggregators: any[] = Object.values(participantAggregator);
  const participantSchedules = aggregators.filter(({ participant }) => {
    return !(
      (participantFilters.participantIds && !participantFilters.participantIds.includes(participant.participantId)) ||
      (participantFilters.participantTypes &&
        !participantFilters.participantTypes.includes(participant.participantType))
    );
  });

  return {
    participantSchedules,
    ...SUCCESS,
  };
}
