import type { IndividualParticipantProfiles } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkParticipantProfileInitialization';
import { checkDependenciesScheduled } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDependenciesScheduled';
import { checkDailyLimits, resolveDailyLimits } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDailyLimits';
import { modifyParticipantDayMatchUps } from '@Mutate/matchUps/schedule/scheduleMatchUps/participantDayLoad';
import { updateTimeAfterRecovery } from '@Mutate/matchUps/schedule/scheduleMatchUps/updateTimeAfterRecovery';
import { addMatchUpScheduledDate } from '@Mutate/matchUps/schedule/scheduleItems/addMatchUpScheduledDate';
import { checkDependendantTiming } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDependentTiming';
import { checkRequestConflicts } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkRequestConflicts';
import type { DailyLimitOverrides } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDailyLimits';
import { processNextMatchUps } from '@Mutate/matchUps/schedule/scheduleMatchUps/processNextMatchUps';
import { checkRecoveryTime } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkRecoveryTime';
import { getVenueSchedulingDetails } from '@Query/matchUps/scheduling/getVenueSchedulingDetails';
import { auditAutoScheduling } from '@Mutate/matchUps/schedule/schedulers/auditAutoScheduling';
import { checkPlayedOrder } from '@Mutate/matchUps/schedule/scheduleItems/playedOrder';
import { extractDate, sameDay, timeStringMinutes, zeroPad } from '@Tools/dateTime';
import { assignMatchUpVenue } from '@Mutate/matchUps/schedule/assignMatchUpVenue';
import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { getMatchUpId } from '@Functions/global/extractors';
import { nowMs } from '@Tools/clock';

// constants
import { SUCCESS } from '@Constants/resultConstants';
import { TOTAL } from '@Constants/scheduleConstants';

export function jinnScheduler({
  schedulingProfileModifications,
  checkPotentialRequestConflicts,
  scheduleCompletedMatchUps, // override which can be used by mocksEngine
  excludeNoDateCompleted,
  schedulingProfileIssues,
  dateSchedulingProfiles,
  containedStructureIds,
  matchUpDependencies,
  participantReachability,
  matchUpDailyLimits,
  dailyLimitOverrides,
  excludePriorDates,
  clearScheduleDates,
  tournamentRecords,
  schedulingProfile,
  personRequests,
  periodLength,
  matchUps,
  courts,
  dryRun,
}) {
  const scheduleTimesRemaining = {};
  const skippedScheduleTimes = {};

  const recoveryTimeDeferredMatchUpIds = {};
  const dependencyDeferredMatchUpIds = {};
  const scheduleDateRequestConflicts = {};
  const matchUpScheduleTimes = {};
  const scheduledMatchUpIds = {};
  const overLimitMatchUpIds = {};
  const overLimitMatchUpDetails = {};
  const noTimeMatchUpIds = {};
  const requestConflicts = {};

  for (const dateSchedulingProfile of dateSchedulingProfiles) {
    const scheduleDate = extractDate(dateSchedulingProfile?.scheduleDate);
    const venues = dateSchedulingProfile?.venues ?? [];
    const matchUpPotentialParticipantIds = {};
    const individualParticipantProfiles = {};

    initializeDateTracking({
      recoveryTimeDeferredMatchUpIds,
      dependencyDeferredMatchUpIds,
      scheduleTimesRemaining,
      skippedScheduleTimes,
      scheduledMatchUpIds,
      overLimitMatchUpIds,
      overLimitMatchUpDetails,
      noTimeMatchUpIds,
      requestConflicts,
      scheduleDate,
    });

    // Build up matchUpNotBeforeTimes for all matchUps already scheduled on scheduleDate
    const matchUpNotBeforeTimes = {};
    matchUps.forEach((matchUp) => {
      if (matchUp.schedule?.scheduledDate && sameDay(scheduleDate, extractDate(matchUp.schedule.scheduledDate))) {
        processNextMatchUps({
          matchUpPotentialParticipantIds,
          matchUpNotBeforeTimes,
          matchUp,
        });
      }
    });

    // BYE schedules are never cleared here: byeSchedulingPreservation keeps every placement
    const { venueScheduledRoundDetails, allDateMatchUpIds } = getVenueSchedulingDetails({
      matchUpPotentialParticipantIds,
      individualParticipantProfiles,
      scheduleCompletedMatchUps,
      excludeNoDateCompleted,
      containedStructureIds,
      matchUpNotBeforeTimes,
      matchUpScheduleTimes,
      matchUpDependencies,
      participantReachability,
      excludePriorDates,
      clearScheduleDates,
      tournamentRecords,
      useGarman: true,
      periodLength,
      scheduleDate,
      matchUps,
      courts,
      venues,
    });

    scheduleVenueRounds({
      checkPotentialRequestConflicts,
      recoveryTimeDeferredMatchUpIds,
      dependencyDeferredMatchUpIds,
      individualParticipantProfiles,
      matchUpPotentialParticipantIds,
      scheduleDateRequestConflicts,
      venueScheduledRoundDetails,
      matchUpScheduleTimes,
      matchUpNotBeforeTimes,
      overLimitMatchUpDetails,
      overLimitMatchUpIds,
      skippedScheduleTimes,
      matchUpDependencies,
      participantReachability,
      matchUpDailyLimits,
      dailyLimitOverrides,
      allDateMatchUpIds,
      requestConflicts,
      personRequests,
      scheduleDate,
      venues,
    });

    assignScheduledTimes({
      venueScheduledRoundDetails,
      scheduleTimesRemaining,
      matchUpDependencies,
      matchUps,
      matchUpScheduleTimes,
      scheduledMatchUpIds,
      tournamentRecords,
      noTimeMatchUpIds,
      scheduleDate,
      venues,
      dryRun,
    });

    computeRoundSchedulePcts({
      scheduledMatchUpIds,
      dateSchedulingProfile,
      scheduleDate,
    });
  }

  // returns the original form of the dateStrings, before extractDate()
  const scheduledDates = dateSchedulingProfiles.map(({ scheduleDate }) => scheduleDate);

  const autoSchedulingAudit = {
    timeStamp: nowMs(),
    overLimitMatchUpIds,
    scheduledMatchUpIds,
    schedulingProfile,
    noTimeMatchUpIds,
    requestConflicts,
    scheduledDates,
  };

  auditAutoScheduling({ tournamentRecords, autoSchedulingAudit });

  return {
    ...SUCCESS,
    schedulingProfileModifications,
    schedulingProfileIssues,
    scheduleTimesRemaining,
    dateSchedulingProfiles,
    skippedScheduleTimes,

    recoveryTimeDeferredMatchUpIds,
    dependencyDeferredMatchUpIds,
    matchUpScheduleTimes,
    overLimitMatchUpDetails,
    overLimitMatchUpIds,
    scheduledMatchUpIds,
    noTimeMatchUpIds,
    requestConflicts,
    scheduledDates,
  };
}

function initializeDateTracking({
  recoveryTimeDeferredMatchUpIds,
  dependencyDeferredMatchUpIds,
  scheduleTimesRemaining,
  skippedScheduleTimes,
  scheduledMatchUpIds,
  overLimitMatchUpDetails,
  overLimitMatchUpIds,
  noTimeMatchUpIds,
  requestConflicts,
  scheduleDate,
}) {
  recoveryTimeDeferredMatchUpIds[scheduleDate] = {};
  dependencyDeferredMatchUpIds[scheduleDate] = {};
  scheduleTimesRemaining[scheduleDate] = {};
  skippedScheduleTimes[scheduleDate] = {};
  scheduledMatchUpIds[scheduleDate] = [];
  overLimitMatchUpDetails[scheduleDate] = [];
  overLimitMatchUpIds[scheduleDate] = [];
  noTimeMatchUpIds[scheduleDate] = [];
  requestConflicts[scheduleDate] = [];
}

function tryScheduleMatchUp({
  checkPotentialRequestConflicts,
  recoveryTimeDeferredMatchUpIds,
  dependencyDeferredMatchUpIds,
  individualParticipantProfiles,
  matchUpPotentialParticipantIds,
  scheduleDateRequestConflicts,
  matchUpScheduleTimes,
  matchUpNotBeforeTimes,
  overLimitMatchUpDetails,
  overLimitMatchUpIds,
  matchUpDependencies,
  participantReachability,
  matchUpDailyLimits,
  dailyLimitOverrides,
  allDateMatchUpIds,
  requestConflicts,
  personRequests,
  scheduleTime,
  scheduleDate,
  details,
  matchUp,
}) {
  const { matchUpId, matchUpType } = matchUp;

  const { participantIdsAtLimit } = checkDailyLimits({
    reachability: participantReachability,
    individualParticipantProfiles,
    matchUpDailyLimits,
    dailyLimitOverrides,
    matchUp,
  });

  if (participantIdsAtLimit.length) {
    if (!overLimitMatchUpIds[scheduleDate].includes(matchUpId)) overLimitMatchUpIds[scheduleDate].push(matchUpId);
    recordOverLimitDetail({
      tournamentId: matchUp.tournamentId,
      overLimitMatchUpDetails,
      individualParticipantProfiles,
      participantIdsAtLimit,
      matchUpDailyLimits,
      dailyLimitOverrides,
      matchUpType,
      scheduleDate,
      scheduleTime,
      matchUpId,
    });
    return false;
  }

  const { scheduledDependent } = checkDependendantTiming({
    matchUpScheduleTimes,
    matchUpDependencies,
    scheduleTime,
    matchUpId,
    details,
  });
  if (scheduledDependent) return false;

  const { dependenciesScheduled, remainingDependencies } = checkDependenciesScheduled({
    matchUpScheduleTimes,
    matchUpDependencies,
    allDateMatchUpIds,
    matchUp,
  });
  if (!dependenciesScheduled) {
    if (!dependencyDeferredMatchUpIds[scheduleDate][matchUpId])
      dependencyDeferredMatchUpIds[scheduleDate][matchUpId] = [];
    dependencyDeferredMatchUpIds[scheduleDate][matchUpId].push({
      scheduleTime,
      remainingDependencies,
    });
    return false;
  }

  const { enoughTime, blockingParticipantIds, notBeforeTime } = checkRecoveryTime({
    individualParticipantProfiles,
    matchUpNotBeforeTimes,
    reachability: participantReachability,
    scheduleTime,
    details,
    matchUp,
  });

  if (!enoughTime) {
    if (!recoveryTimeDeferredMatchUpIds[scheduleDate][matchUpId])
      recoveryTimeDeferredMatchUpIds[scheduleDate][matchUpId] = [];
    recoveryTimeDeferredMatchUpIds[scheduleDate][matchUpId].push({
      scheduleTime,
      blockingParticipantIds,
      notBeforeTime,
    });
    return false;
  }

  const averageMatchUpMinutes = details.greatestAverageMinutes;

  const { conflicts } = checkRequestConflicts({
    potentials: checkPotentialRequestConflicts,
    averageMatchUpMinutes,
    requestConflicts,
    personRequests,
    scheduleTime,
    scheduleDate,
    matchUp,
  });

  if (conflicts?.length) {
    if (!scheduleDateRequestConflicts[scheduleDate]) scheduleDateRequestConflicts[scheduleDate] = [];
    scheduleDateRequestConflicts[scheduleDate].push(...conflicts);
    return false;
  }

  modifyParticipantDayMatchUps({
    individualParticipantProfiles,
    reachability: participantReachability,
    matchUp,
    value: 1,
  });

  const recoveryMinutes = details.minutesMap?.[matchUpId]?.recoveryMinutes;
  const typeChangeRecoveryMinutes = details.minutesMap?.[matchUpId]?.typeChangeRecoveryMinutes;

  updateTimeAfterRecovery({
    typeChangeRecoveryMinutes,
    matchUpPotentialParticipantIds,
    individualParticipantProfiles,
    matchUpNotBeforeTimes,
    averageMatchUpMinutes,
    reachability: participantReachability,
    recoveryMinutes,
    scheduleTime,
    matchUp,
  });

  matchUpScheduleTimes[matchUpId] = scheduleTime;

  return true;
}

function scheduleVenueRounds({
  checkPotentialRequestConflicts,
  recoveryTimeDeferredMatchUpIds,
  dependencyDeferredMatchUpIds,
  individualParticipantProfiles,
  matchUpPotentialParticipantIds,
  scheduleDateRequestConflicts,
  venueScheduledRoundDetails,
  matchUpScheduleTimes,
  matchUpNotBeforeTimes,
  overLimitMatchUpDetails,
  overLimitMatchUpIds,
  skippedScheduleTimes,
  matchUpDependencies,
  participantReachability,
  matchUpDailyLimits,
  dailyLimitOverrides,
  allDateMatchUpIds,
  requestConflicts,
  personRequests,
  scheduleDate,
  venues,
}) {
  const maxScheduleTimeAttempts = 10;
  let schedulingIterations = 0;
  let schedulingComplete;
  // every pass that leaves a venue incomplete consumes at least one scheduleTime attempt,
  // and no scheduleTime is attempted more than maxScheduleTimeAttempts times, so the day's
  // slots bound the passes; a constant cap stopped a long day after a fixed number of passes
  const failSafe = getPassesBound({ venueScheduledRoundDetails, maxScheduleTimeAttempts, venues });

  while (!schedulingComplete) {
    for (const { venueId } of venues) {
      let scheduledThisPass = 0;
      const details = venueScheduledRoundDetails[venueId];

      while (
        details.courtsCount &&
        details.scheduleTimes?.length &&
        details.matchUpsToSchedule?.length &&
        scheduledThisPass <= details.courtsCount
      ) {
        const { scheduleTime, attempts = 0 } = details.scheduleTimes.shift();
        const scheduledMatchUp = details.matchUpsToSchedule.find((matchUp) =>
          tryScheduleMatchUp({
            checkPotentialRequestConflicts,
            recoveryTimeDeferredMatchUpIds,
            dependencyDeferredMatchUpIds,
            individualParticipantProfiles,
            matchUpPotentialParticipantIds,
            scheduleDateRequestConflicts,
            matchUpScheduleTimes,
            matchUpNotBeforeTimes,
            overLimitMatchUpDetails,
            overLimitMatchUpIds,
            matchUpDependencies,
            participantReachability,
            matchUpDailyLimits,
            dailyLimitOverrides,
            allDateMatchUpIds,
            requestConflicts,
            personRequests,
            scheduleTime,
            scheduleDate,
            details,
            matchUp,
          }),
        );

        details.matchUpsToSchedule = details.matchUpsToSchedule.filter(
          ({ matchUpId }) => matchUpId !== scheduledMatchUp?.matchUpId,
        );

        if (!scheduledMatchUp) {
          if (!skippedScheduleTimes[scheduleDate][venueId]) skippedScheduleTimes[scheduleDate][venueId] = [];
          skippedScheduleTimes[scheduleDate][venueId].push({
            scheduleTime,
            attempts: attempts + 1,
          });
        } else {
          scheduledThisPass += 1;
        }
      }

      if (details.matchUpsToSchedule?.length) {
        skippedScheduleTimes[scheduleDate][venueId] = skippedScheduleTimes[scheduleDate][venueId]?.filter((unused) => {
          const tryAgain = unused.attempts < maxScheduleTimeAttempts;
          if (tryAgain) details.scheduleTimes.push(unused);
          return !tryAgain;
        });
      }

      if (!details.courtsCount || !details.scheduleTimes?.length || !details.matchUpsToSchedule?.length)
        details.complete = true;
    }

    schedulingIterations += 1;
    schedulingComplete =
      venues.every(({ venueId }) => venueScheduledRoundDetails[venueId].complete) || schedulingIterations >= failSafe;
  }
}

type PassesBoundArgs = {
  venueScheduledRoundDetails: { [venueId: string]: { scheduleTimes?: unknown[] } };
  maxScheduleTimeAttempts: number;
  venues: { venueId: string }[];
};

function getPassesBound({ venueScheduledRoundDetails, maxScheduleTimeAttempts, venues }: PassesBoundArgs): number {
  const slotsCount = venues.reduce(
    (count: number, { venueId }) => count + (venueScheduledRoundDetails[venueId]?.scheduleTimes?.length ?? 0),
    0,
  );
  return slotsCount * maxScheduleTimeAttempts + 1;
}

function assignScheduledTimes({
  venueScheduledRoundDetails,
  scheduleTimesRemaining,
  matchUpDependencies,
  matchUps,
  matchUpScheduleTimes,
  scheduledMatchUpIds,
  tournamentRecords,
  noTimeMatchUpIds,
  scheduleDate,
  venues,
  dryRun,
}) {
  for (const { venueId } of venues) {
    const matchUpMap = venueScheduledRoundDetails[venueId].matchUpMap;

    Object.keys(matchUpMap).forEach((tournamentId) => {
      const tournamentRecord = tournamentRecords[tournamentId];
      if (!tournamentRecord) return;

      Object.keys(matchUpMap[tournamentId]).forEach((drawId) => {
        const { drawDefinition } = findDrawDefinition({
          tournamentRecord,
          drawId,
        });
        if (!drawDefinition) return;

        const drawMatchUps = matchUpMap[tournamentId][drawId];
        drawMatchUps.forEach(({ matchUpId }) => {
          scheduleMatchUpTime({
            scheduledMatchUpIds,
            matchUpDependencies,
            noTimeMatchUpIds,
            drawDefinition,
            matchUps,
            matchUpScheduleTimes,
            tournamentRecord,
            scheduleDate,
            matchUpId,
            venueId,
            dryRun,
          });
        });
      });
    });

    // accumulate across venues: every venue on the date reports the matchUps it could not place
    noTimeMatchUpIds[scheduleDate].push(...venueScheduledRoundDetails[venueId].matchUpsToSchedule.map(getMatchUpId));

    scheduleTimesRemaining[scheduleDate][venueId] = venueScheduledRoundDetails[venueId].scheduleTimes.sort(
      (a, b) => timeStringMinutes(a.scheduleTime) - timeStringMinutes(b.scheduleTime),
    );
  }
}

function scheduleMatchUpTime({
  scheduledMatchUpIds,
  matchUpDependencies,
  noTimeMatchUpIds,
  drawDefinition,
  matchUps,
  matchUpScheduleTimes,
  tournamentRecord,
  scheduleDate,
  matchUpId,
  venueId,
  dryRun,
}) {
  const scheduleTime = matchUpScheduleTimes[matchUpId];
  if (!scheduleTime) return;

  const formatTime = scheduleTime.split(':').map(zeroPad).join(':');
  const scheduledDate = extractDate(scheduleDate);

  if (dryRun) {
    scheduledMatchUpIds[scheduleDate].push(matchUpId);
    return;
  }

  // the played order is asked once, of the date and time together and with the graph this run already holds: asked of
  // each write apart it rebuilt the graph per write, and judged the date against the matchUp's old time
  const refusal = checkPlayedOrder({
    schedule: { scheduledDate, scheduledTime: formatTime },
    inContextMatchUps: matchUps,
    matchUpDependencies,
    drawDefinition,
    matchUpId,
  });
  if (refusal) {
    noTimeMatchUpIds[scheduleDate].push(matchUpId);
    return;
  }

  // Persist date and time as separate timeItems so SCHEDULED_TIME is plain HH:mm.
  // Without an explicit SCHEDULED_DATE, addMatchUpScheduledTime falls back to
  // embedding the date in the time value, which surfaces as "YYYY-MM-DDTHH:mm" in UI.
  addMatchUpScheduledDate({
    playedOrderChecked: true,
    tournamentRecord,
    drawDefinition,
    scheduledDate,
    matchUpId,
  });

  const result = addMatchUpScheduledTime({
    scheduledTime: formatTime,
    playedOrderChecked: true,
    drawDefinition,
    matchUpId,
  });
  if (!result.success) return;
  scheduledMatchUpIds[scheduleDate].push(matchUpId);

  if (venueId) {
    assignMatchUpVenue({
      tournamentRecord,
      drawDefinition,
      matchUpId,
      venueId,
    });
  }
}

// Capture per-attempt explanation for an over-limit refusal: which
// participants on the matchUp are at the cap, and which counters
// (matchUpType / TOTAL) they have hit and at what value. Pushed in
// addition to the existing flat overLimitMatchUpIds array so existing
// consumers continue to work; the drawer reads this when present.
type OverLimitMatchUpDetail = {
  participants: { participantId: string; atLimitCounters: { counter: string; count: number; limit: number }[] }[];
  attemptedTime: string;
  matchUpId: string;
};

type RecordOverLimitDetailArgs = {
  overLimitMatchUpDetails: { [scheduleDate: string]: OverLimitMatchUpDetail[] };
  individualParticipantProfiles: IndividualParticipantProfiles;
  matchUpDailyLimits?: { [counterName: string]: number };
  dailyLimitOverrides?: DailyLimitOverrides;
  participantIdsAtLimit: string[];
  tournamentId?: string;
  matchUpType?: string;
  scheduleDate: string;
  scheduleTime: string;
  matchUpId: string;
};

function recordOverLimitDetail({
  overLimitMatchUpDetails,
  individualParticipantProfiles,
  participantIdsAtLimit,
  matchUpDailyLimits,
  dailyLimitOverrides,
  tournamentId,
  matchUpType,
  scheduleDate,
  scheduleTime,
  matchUpId,
}: RecordOverLimitDetailArgs) {
  const counterNames = [matchUpType, TOTAL].filter((counterName): counterName is string => !!counterName);
  const participants = participantIdsAtLimit.map((participantId) => {
    const counters = individualParticipantProfiles[participantId]?.counters || {};
    const limits = resolveDailyLimits({ dailyLimitOverrides, matchUpDailyLimits, participantId, tournamentId });
    const atLimitCounters = counterNames
      .filter((counterName) => {
        const count = counters[counterName] || 0;
        const limit = limits[counterName] || 0;
        return count && limit && count >= limit;
      })
      .map((counterName) => ({
        counter: counterName,
        count: counters[counterName],
        limit: limits[counterName],
      }));
    return { participantId, atLimitCounters };
  });
  overLimitMatchUpDetails[scheduleDate].push({
    matchUpId,
    attemptedTime: scheduleTime,
    participants,
  });
}

function computeRoundSchedulePcts({ scheduledMatchUpIds, dateSchedulingProfile, scheduleDate }) {
  for (const venue of dateSchedulingProfile.venues) {
    for (const round of venue.rounds) {
      const matchUpIds = round.matchUps?.map(({ matchUpId }) => matchUpId) ?? [];
      const canScheduleMatchUpIds = matchUpIds.filter((matchUpId) =>
        scheduledMatchUpIds[scheduleDate].includes(matchUpId),
      );
      round.canScheduledMatchUpIds = canScheduleMatchUpIds;
      let possibleToSchedulePct = Math.round((canScheduleMatchUpIds.length / round.matchUpsCount) * 10000) / 100;
      if (possibleToSchedulePct === Infinity || Number.isNaN(possibleToSchedulePct)) possibleToSchedulePct = 0;
      round.possibleToSchedulePct = possibleToSchedulePct;
      if (round.matchUpsCount === canScheduleMatchUpIds.length) {
        round.possibleToSchedule = true;
      }
    }
  }
}
