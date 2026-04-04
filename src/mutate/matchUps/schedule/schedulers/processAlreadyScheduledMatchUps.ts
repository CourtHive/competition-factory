import { modifyParticipantMatchUpsCount } from '@Mutate/matchUps/schedule/scheduleMatchUps/modifyParticipantMatchUpsCount';
import { updateTimeAfterRecovery } from '@Mutate/matchUps/schedule/scheduleMatchUps/updateTimeAfterRecovery';
import { getMatchUpId } from '@Functions/global/extractors';
import { hasSchedule } from '@Query/matchUp/hasSchedule';

// constants and types
import { BYE } from '@Constants/matchUpStatusConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type ProcessAlreadyScheduledMatchUpsArgs = {
  matchUpPotentialParticipantIds: { [key: string]: string[] };
  matchUpNotBeforeTimes: { [key: string]: any };
  matchUpScheduleTimes: { [key: string]: any };
  dateScheduledMatchUps?: HydratedMatchUp[];
  individualParticipantProfiles: any;
  dateScheduledMatchUpIds: string[];
  greatestAverageMinutes?: number;
  clearScheduleDates?: boolean;
  matchUps: HydratedMatchUp[];
  matchUpDependencies: any;
  scheduleDate: string;
  minutesMap: any;
};
export function processAlreadyScheduledMatchUps({
  matchUpPotentialParticipantIds,
  individualParticipantProfiles,
  dateScheduledMatchUpIds,
  greatestAverageMinutes,
  dateScheduledMatchUps,
  matchUpNotBeforeTimes,
  matchUpScheduleTimes,
  matchUpDependencies,
  clearScheduleDates,
  scheduleDate,
  minutesMap,
  matchUps,
}: ProcessAlreadyScheduledMatchUpsArgs) {
  const byeScheduledMatchUpDetails: {
    tournamentId: string;
    matchUpId: string;
  }[] = [];

  if (!dateScheduledMatchUpIds) {
    dateScheduledMatchUps = matchUps?.filter((matchUp) => {
      const schedule = matchUp.schedule ?? {};
      const isByeMatchUp = matchUp.matchUpStatus === BYE;
      if (isByeMatchUp)
        byeScheduledMatchUpDetails.push({
          tournamentId: matchUp.tournamentId,
          matchUpId: matchUp.matchUpId,
        });
      return (
        !isByeMatchUp && hasSchedule({ schedule }) && (!scheduleDate || matchUp.schedule.scheduledDate === scheduleDate)
      );
    });

    dateScheduledMatchUpIds = dateScheduledMatchUps.map(getMatchUpId);
  }

  // first build up a map of matchUpNotBeforeTimes and matchUpPotentialParticipantIds
  // based on already scheduled matchUps
  const clearDate = Array.isArray(clearScheduleDates) ? clearScheduleDates.includes(scheduleDate) : clearScheduleDates;

  const alreadyScheduled = clearDate
    ? []
    : matchUps.filter(({ matchUpId }) => dateScheduledMatchUpIds.includes(matchUpId));

  for (const matchUp of alreadyScheduled) {
    modifyParticipantMatchUpsCount({
      matchUpPotentialParticipantIds,
      individualParticipantProfiles,
      value: 1,
      matchUp,
    });

    const scheduleTime = matchUp.schedule?.scheduledTime;

    if (scheduleTime) {
      matchUpScheduleTimes[matchUp.matchUpId] = scheduleTime;
      const recoveryMinutes = minutesMap?.[matchUp.matchUpId]?.recoveryMinutes;
      const averageMatchUpMinutes = greatestAverageMinutes;
      // minutesMap?.[matchUp.matchUpId]?.averageMinutes; // for the future when variable averageMinutes supported

      updateTimeAfterRecovery({
        individualParticipantProfiles,
        matchUpPotentialParticipantIds,
        matchUpNotBeforeTimes,
        matchUpDependencies,
        averageMatchUpMinutes,
        recoveryMinutes,
        scheduleTime,
        matchUp,
      });
    }
  }

  return {
    dateScheduledMatchUpIds,
    byeScheduledMatchUpDetails,
    dateScheduledMatchUps,
    clearDate,
  };
}
