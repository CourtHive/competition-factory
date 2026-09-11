import { modifyParticipantMatchUpsCount } from '@Mutate/matchUps/schedule/scheduleMatchUps/modifyParticipantMatchUpsCount';
import { updateTimeAfterRecovery } from '@Mutate/matchUps/schedule/scheduleMatchUps/updateTimeAfterRecovery';
import { getMatchUpId } from '@Functions/global/extractors';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import { extractDate } from '@Tools/dateTime';

// constants and types
import { BYE, COMPLETED } from '@Constants/matchUpStatusConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type ProcessAlreadyScheduledMatchUpsArgs = {
  matchUpPotentialParticipantIds: { [key: string]: string[] };
  matchUpNotBeforeTimes: { [key: string]: any };
  matchUpScheduleTimes: { [key: string]: any };
  dateScheduledMatchUps?: HydratedMatchUp[];
  individualParticipantProfiles: any;
  dateScheduledMatchUpIds: string[];
  greatestAverageMinutes?: number;
  excludeNoDateCompleted?: boolean;
  clearScheduleDates?: boolean;
  excludePriorDates?: boolean;
  matchUps: HydratedMatchUp[];
  matchUpDependencies: any;
  scheduleDate: string;
  minutesMap: any;
};
export function processAlreadyScheduledMatchUps({
  matchUpPotentialParticipantIds,
  individualParticipantProfiles,
  excludeNoDateCompleted = true,
  dateScheduledMatchUpIds,
  greatestAverageMinutes,
  dateScheduledMatchUps,
  matchUpNotBeforeTimes,
  matchUpScheduleTimes,
  excludePriorDates = true,
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
        !isByeMatchUp &&
        hasSchedule({ schedule }) &&
        (!scheduleDate || matchUp.schedule?.scheduledDate === scheduleDate)
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

  // Exclude historical/orphan matchUps from contributing to the day's per-participant
  // counters. The Day Plan defines what is being scheduled today; matchUps that
  // (a) completed without ever carrying a scheduledDate, or (b) carry a scheduledDate
  // strictly prior to the day being scheduled, must not consume a participant's
  // daily-limit budget for today. Both checks default on; callers wanting the legacy
  // behavior can opt back in by passing the flag as false.
  const targetDate = excludePriorDates && scheduleDate ? extractDate(scheduleDate) : undefined;
  const shouldExclude = (matchUp: HydratedMatchUp) => {
    const schedule = matchUp.schedule ?? {};
    const matchUpStatus = matchUp.matchUpStatus;
    const isCompletedOrBye = matchUpStatus === COMPLETED || matchUpStatus === BYE;
    if (excludeNoDateCompleted && isCompletedOrBye && !schedule.scheduledDate) return true;
    if (targetDate && schedule.scheduledDate) {
      const matchUpDate = extractDate(schedule.scheduledDate);
      if (matchUpDate && matchUpDate < targetDate) return true;
    }
    return false;
  };

  for (const matchUp of alreadyScheduled) {
    if (shouldExclude(matchUp)) continue;

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
