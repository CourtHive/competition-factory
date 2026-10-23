import { addMatchUpScheduledDate } from '@Mutate/matchUps/schedule/scheduleItems/addMatchUpScheduledDate';
import { processNextMatchUps } from '@Mutate/matchUps/schedule/scheduleMatchUps/processNextMatchUps';
import { getVenueSchedulingDetails } from '@Query/matchUps/scheduling/getVenueSchedulingDetails';
import { computeRoundSchedulePcts } from '@Mutate/matchUps/schedule/pipeline/roundSchedulePcts';
import { auditAutoScheduling } from '@Mutate/matchUps/schedule/schedulers/auditAutoScheduling';
import { scheduleVenueRounds } from '@Mutate/matchUps/schedule/pipeline/placeVenueRounds';
import { checkPlayedOrder } from '@Mutate/matchUps/schedule/scheduleItems/playedOrder';
import { extractDate, sameDay, timeStringMinutes, zeroPad } from '@Tools/dateTime';
import { assignMatchUpVenue } from '@Mutate/matchUps/schedule/assignMatchUpVenue';
import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { getMatchUpId } from '@Functions/global/extractors';
import { nowMs } from '@Tools/clock';

// constants
import { SUCCESS } from '@Constants/resultConstants';

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
