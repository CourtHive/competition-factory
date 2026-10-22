import type { ParticipantReachability } from '@Mutate/matchUps/schedule/scheduleMatchUps/getParticipantReachability';
import { modifyParticipantDayMatchUps } from '@Mutate/matchUps/schedule/scheduleMatchUps/participantDayLoad';
import { updateTimeAfterRecovery } from '@Mutate/matchUps/schedule/scheduleMatchUps/updateTimeAfterRecovery';
import { findMatchUpFormatTiming } from '@Acquire/findMatchUpFormatTiming';
import { getMatchUpId } from '@Functions/global/extractors';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import { findEvent } from '@Acquire/findEvent';
import { extractDate } from '@Tools/dateTime';

// constants and types
import { BYE, COMPLETED } from '@Constants/matchUpStatusConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type ProcessAlreadyScheduledMatchUpsArgs = {
  matchUpPotentialParticipantIds: { [key: string]: string[] };
  matchUpNotBeforeTimes: { [key: string]: any };
  matchUpScheduleTimes: { [key: string]: string };
  dateScheduledMatchUps?: HydratedMatchUp[];
  individualParticipantProfiles: any;
  dateScheduledMatchUpIds: string[];
  greatestAverageMinutes?: number;
  excludeNoDateCompleted?: boolean;
  clearScheduleDates?: boolean | string[];
  excludePriorDates?: boolean;
  matchUps: HydratedMatchUp[];
  matchUpDependencies: any;
  participantReachability: ParticipantReachability;
  tournamentRecords?: { [key: string]: Tournament };
  scheduleDate: string;
  minutesMap: any;
};

/**
 * The recovery minutes of a matchUp already timed on the date. `minutesMap` holds only the matchUps the profile is about
 * to schedule, so a matchUp outside it (a completed one, or one timed outside the profile) read none, and its
 * participants were free again the moment its average minutes ran out (C1, SCHEDULING_PIPELINE_VNEXT.md § 5). Such a
 * matchUp's minutes come from its own format and event.
 */
type Minutes = { recoveryMinutes?: number; typeChangeRecoveryMinutes?: number };
function alreadyScheduledMinutes({
  tournamentRecords,
  minutesMap,
  matchUp,
}: {
  tournamentRecords?: { [key: string]: Tournament };
  minutesMap?: { [matchUpId: string]: Minutes };
  matchUp: HydratedMatchUp;
}): Minutes | undefined {
  const mapped = minutesMap?.[matchUp.matchUpId];
  if (mapped || !tournamentRecords || !matchUp.matchUpFormat || !matchUp.tournamentId) return mapped;
  const tournamentRecord = tournamentRecords[matchUp.tournamentId];
  const { event } = findEvent({ tournamentRecord, eventId: matchUp.eventId });
  const { category, eventType } = event ?? {};
  const timing = findMatchUpFormatTiming({
    categoryName: category?.categoryName ?? category?.ageCategoryCode,
    categoryType: category?.categoryType,
    tournamentId: matchUp.tournamentId,
    matchUpFormat: matchUp.matchUpFormat,
    eventId: matchUp.eventId,
    tournamentRecords,
    eventType,
  });
  return 'error' in timing ? undefined : timing;
}
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
  participantReachability,
  clearScheduleDates,
  tournamentRecords,
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
        // compare calendar dates: a stored scheduledDate may carry a time component
        (!scheduleDate || extractDate(matchUp.schedule?.scheduledDate) === extractDate(scheduleDate))
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

    modifyParticipantDayMatchUps({
      reachability: participantReachability,
      individualParticipantProfiles,
      value: 1,
      matchUp,
    });

    const scheduleTime = matchUp.schedule?.scheduledTime;

    if (scheduleTime) {
      matchUpScheduleTimes[matchUp.matchUpId] = scheduleTime;
      const minutes = alreadyScheduledMinutes({ matchUp, minutesMap, tournamentRecords });
      const recoveryMinutes = minutes?.recoveryMinutes;
      const typeChangeRecoveryMinutes = minutes?.typeChangeRecoveryMinutes;
      const averageMatchUpMinutes = greatestAverageMinutes;
      // minutesMap?.[matchUp.matchUpId]?.averageMinutes; // for the future when variable averageMinutes supported

      updateTimeAfterRecovery({
        typeChangeRecoveryMinutes,
        individualParticipantProfiles,
        matchUpPotentialParticipantIds,
        matchUpNotBeforeTimes,
        reachability: participantReachability,
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
