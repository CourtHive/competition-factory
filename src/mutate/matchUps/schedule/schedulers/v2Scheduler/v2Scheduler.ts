import { addMinutesToTimeString, extractDate, sameDay, timeStringMinutes, timeToDate, zeroPad } from '@Tools/dateTime';
import { checkDependenciesScheduled } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDependenciesScheduled';
import { updateTimeAfterRecovery } from '@Mutate/matchUps/schedule/scheduleMatchUps/updateTimeAfterRecovery';
import { checkDependendantTiming } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDependentTiming';
import { checkRequestConflicts } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkRequestConflicts';
import { generateVirtualCourts } from '@Assemblies/generators/scheduling/utils/generateVirtualCourts';
import { processNextMatchUps } from '@Mutate/matchUps/schedule/scheduleMatchUps/processNextMatchUps';
import { getEarliestCourtTime } from '@Assemblies/generators/scheduling/utils/getEarliestCourtTime';
import { getVenueSchedulingDetails } from '@Query/matchUps/scheduling/getVenueSchedulingDetails';
import { checkRecoveryTime } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkRecoveryTime';
import { auditAutoScheduling } from '@Mutate/matchUps/schedule/schedulers/auditAutoScheduling';
import { checkDailyLimits } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDailyLimits';
import { generateBookings } from '@Assemblies/generators/scheduling/utils/generateBookings';
import { bulkScheduleMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleMatchUps';
import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
import { assignMatchUpCourt } from '@Mutate/matchUps/schedule/assignMatchUpCourt';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { getMatchUpId } from '@Functions/global/extractors';

// Constants and types
import { PersonRequests, TournamentRecords } from '@Types/factoryTypes';
import { HydratedCourt, HydratedMatchUp } from '@Types/hydrated';
import { SUCCESS } from '@Constants/resultConstants';
import { TOTAL } from '@Constants/scheduleConstants';

// NOTE: non-Garman scheduling

function evaluateCourt({
  recoveryTimeDeferredMatchUpIds,
  checkPotentialRequestConflicts,
  matchUpPotentialParticipantIds,
  individualParticipantProfiles,
  matchUpNotBeforeTimes,
  venueEarliestCourtTime,
  schedulingConflicts,
  matchUpScheduleTimes,
  matchUpDependencies,
  relevantParticipantIds,
  requestConflicts,
  personRequests,
  scheduleDate,
  bumpLimits,
  matchUpType,
  matchUpId,
  courtTime,
  matchUp,
  details,
  court,
}) {
  const { earliestCourtTime: scheduleTime } = getEarliestCourtTime({
    averageMinutes: details.greatestAverageMinutes,
    startTime: venueEarliestCourtTime,
    date: scheduleDate,
    court,
  });

  if (courtTime.scheduleTime && timeStringMinutes(scheduleTime) >= timeStringMinutes(courtTime.scheduleTime)) {
    return courtTime;
  }

  const { scheduledDependent } = checkDependendantTiming({
    matchUpScheduleTimes,
    matchUpDependencies,
    scheduleTime,
    matchUpId,
    details,
  });
  if (scheduledDependent) return courtTime;

  const { enoughTime } = checkRecoveryTime({
    individualParticipantProfiles,
    matchUpNotBeforeTimes,
    matchUpDependencies,
    scheduleTime,
    details,
    matchUp,
  });

  if (!enoughTime) {
    if (!recoveryTimeDeferredMatchUpIds[scheduleDate][matchUpId])
      recoveryTimeDeferredMatchUpIds[scheduleDate][matchUpId] = [];
    if (!recoveryTimeDeferredMatchUpIds[scheduleDate][matchUpId].includes(scheduleTime)) {
      recoveryTimeDeferredMatchUpIds[scheduleDate][matchUpId].push(scheduleTime);
    }
    return courtTime;
  }

  const averageMatchUpMinutes = details.minutesMap?.[matchUpId]?.averageMinutes || details.greatestAverageMinutes;

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
    schedulingConflicts.push(...conflicts);
    return false;
  }

  bumpLimits(relevantParticipantIds, matchUpType);

  const recoveryMinutes = details.minutesMap?.[matchUpId]?.recoveryMinutes;

  updateTimeAfterRecovery({
    matchUpPotentialParticipantIds,
    individualParticipantProfiles,
    matchUpNotBeforeTimes,
    averageMatchUpMinutes,
    matchUpDependencies,
    recoveryMinutes,
    scheduleTime,
    matchUp,
  });

  if (!courtTime.scheduleTime || timeStringMinutes(scheduleTime) < timeStringMinutes(courtTime.scheduleTime)) {
    courtTime.averageMatchUpMinutes = averageMatchUpMinutes;
    courtTime.recoveryMinutes = recoveryMinutes;
    courtTime.scheduleTime = scheduleTime;
    courtTime.courtName = court.courtName;
    courtTime.courtId = court.courtId;
  }

  return courtTime;
}

function findBestCourtTime({
  recoveryTimeDeferredMatchUpIds,
  checkPotentialRequestConflicts,
  matchUpPotentialParticipantIds,
  individualParticipantProfiles,
  matchUpNotBeforeTimes,
  venueEarliestCourtTime,
  schedulingConflicts,
  matchUpScheduleTimes,
  matchUpDependencies,
  relevantParticipantIds,
  courtIdsScheduled,
  requestConflicts,
  personRequests,
  scheduleDate,
  bumpLimits,
  matchUpType,
  dateCourts,
  matchUpId,
  matchUp,
  details,
}) {
  return dateCourts?.reduce((courtTime, court) => {
    if (courtIdsScheduled.includes(court.courtId)) return courtTime;

    return evaluateCourt({
      recoveryTimeDeferredMatchUpIds,
      checkPotentialRequestConflicts,
      matchUpPotentialParticipantIds,
      individualParticipantProfiles,
      matchUpNotBeforeTimes,
      venueEarliestCourtTime,
      schedulingConflicts,
      matchUpScheduleTimes,
      matchUpDependencies,
      relevantParticipantIds,
      requestConflicts,
      personRequests,
      scheduleDate,
      bumpLimits,
      matchUpType,
      matchUpId,
      courtTime,
      matchUp,
      details,
      court,
    });
  }, {});
}

function tryScheduleMatchUp({
  recoveryTimeDeferredMatchUpIds,
  checkPotentialRequestConflicts,
  dependencyDeferredMatchUpIds,
  matchUpPotentialParticipantIds,
  individualParticipantProfiles,
  scheduleDateRequestConflicts,
  matchUpNotBeforeTimes,
  venueEarliestCourtTime,
  matchUpScheduleCourtIds,
  overLimitMatchUpIds,
  matchUpScheduleTimes,
  matchUpDependencies,
  matchUpDailyLimits,
  courtIdsScheduled,
  requestConflicts,
  allDateMatchUpIds,
  personRequests,
  periodLength,
  scheduleDate,
  bumpLimits,
  dateCourts,
  matchUp,
  details,
  venueId,
}) {
  const { matchUpId, matchUpType } = matchUp;

  const { participantIdsAtLimit, relevantParticipantIds } = checkDailyLimits({
    matchUpPotentialParticipantIds,
    individualParticipantProfiles,
    matchUpDailyLimits,
    matchUp,
  });

  if (participantIdsAtLimit.length) {
    if (!overLimitMatchUpIds[scheduleDate].includes(matchUpId)) overLimitMatchUpIds[scheduleDate].push(matchUpId);
    return { skipped: 'overLimit' };
  }

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
      remainingDependencies,
    });
    return { skipped: 'dependencyDeferred' };
  }

  const schedulingConflicts: any[] = [];
  const courtTime = findBestCourtTime({
    recoveryTimeDeferredMatchUpIds,
    checkPotentialRequestConflicts,
    matchUpPotentialParticipantIds,
    individualParticipantProfiles,
    matchUpNotBeforeTimes,
    venueEarliestCourtTime,
    schedulingConflicts,
    matchUpScheduleTimes,
    matchUpDependencies,
    relevantParticipantIds,
    courtIdsScheduled,
    requestConflicts,
    personRequests,
    scheduleDate,
    bumpLimits,
    matchUpType,
    dateCourts,
    matchUpId,
    matchUp,
    details,
  });

  if (courtTime.scheduleTime) {
    const { averageMatchUpMinutes, recoveryMinutes, scheduleTime, courtId } = courtTime;
    matchUpScheduleTimes[matchUpId] = scheduleTime;
    matchUpScheduleCourtIds[matchUpId] = courtId;

    const startTime = scheduleTime;
    const endTime = addMinutesToTimeString(startTime, averageMatchUpMinutes);
    const booking = {
      averageMatchUpMinutes,
      recoveryMinutes,
      periodLength,
      matchUpId,
      startTime,
      courtId,
      endTime,
      venueId,
    };

    return { scheduled: true, matchUpId, courtId, booking };
  } else if (schedulingConflicts?.length) {
    if (!scheduleDateRequestConflicts[scheduleDate]) scheduleDateRequestConflicts[scheduleDate] = [];
    scheduleDateRequestConflicts[scheduleDate].push(...schedulingConflicts);
  }

  return { scheduled: false };
}

function applyScheduleResults({
  venueScheduledRoundDetails,
  matchUpScheduleCourtIds,
  scheduledMatchUpIds,
  matchUpScheduleTimes,
  noTimeMatchUpIds,
  tournamentRecords,
  scheduleDate,
  venues,
  dryRun,
}) {
  // assign scheduledTime, venueId and courtId to each matchUp
  // because this is done in an optimized fashion from hash of assignments
  // scheduledMatchUpIds[scheduleDate] will not be in the order that scheduleTimes were assigned
  for (const { venueId } of venues) {
    const matchUpMap = venueScheduledRoundDetails[venueId].matchUpMap;

    Object.keys(matchUpMap).forEach((tournamentId) => {
      const tournamentRecord = tournamentRecords[tournamentId];
      if (tournamentRecord) {
        Object.keys(matchUpMap[tournamentId]).forEach((drawId) => {
          const { drawDefinition } = findDrawDefinition({
            tournamentRecord,
            drawId,
          });
          if (drawDefinition) {
            const drawMatchUps = matchUpMap[tournamentId][drawId];

            drawMatchUps.forEach(({ matchUpId }) => {
              const scheduleTime = matchUpScheduleTimes[matchUpId];
              const courtId = matchUpScheduleCourtIds[matchUpId];
              if (scheduleTime) {
                // must include scheduleDate being scheduled to generate proper ISO string
                const formatTime = scheduleTime.split(':').map(zeroPad).join(':');
                const scheduledTime = `${extractDate(scheduleDate)}T${formatTime}`;

                if (dryRun) {
                  scheduledMatchUpIds[scheduleDate].push(matchUpId);
                } else {
                  addMatchUpScheduledTime({
                    drawDefinition,
                    scheduledTime,
                    matchUpId,
                  });
                  assignMatchUpCourt({
                    courtDayDate: scheduleDate,
                    tournamentRecords,
                    tournamentRecord,
                    drawDefinition,
                    matchUpId,
                    courtId,
                  });
                  scheduledMatchUpIds[scheduleDate].push(matchUpId);
                }
              }
            });
          }
        });
      }
    });

    noTimeMatchUpIds[scheduleDate] = venueScheduledRoundDetails[venueId].matchUpsToSchedule.map(getMatchUpId);
  }
}

function scheduleVenuePass({
  recoveryTimeDeferredMatchUpIds,
  checkPotentialRequestConflicts,
  dependencyDeferredMatchUpIds,
  matchUpPotentialParticipantIds,
  individualParticipantProfiles,
  scheduleDateRequestConflicts,
  matchUpNotBeforeTimes,
  venueEarliestCourtTime,
  matchUpScheduleCourtIds,
  addDateCourtBooking,
  overLimitMatchUpIds,
  matchUpScheduleTimes,
  matchUpDependencies,
  matchUpDailyLimits,
  requestConflicts,
  allDateMatchUpIds,
  personRequests,
  periodLength,
  scheduleDate,
  bumpLimits,
  dateCourts,
  details,
  venueId,
}) {
  const venuePassFailSafe = details.matchUpsToSchedule.length;
  const matchUpIdsScheduled: string[] = [];
  const courtIdsScheduled: string[] = [];
  let venuePassComplete;
  let passIterations = 0;

  while (!venuePassComplete) {
    for (const matchUp of details.matchUpsToSchedule) {
      if (courtIdsScheduled.length === details.courtsCount || matchUpIdsScheduled.length === details.courtsCount) {
        venuePassComplete = true;
        break;
      }

      const result = tryScheduleMatchUp({
        recoveryTimeDeferredMatchUpIds,
        checkPotentialRequestConflicts,
        dependencyDeferredMatchUpIds,
        matchUpPotentialParticipantIds,
        individualParticipantProfiles,
        scheduleDateRequestConflicts,
        matchUpNotBeforeTimes,
        venueEarliestCourtTime,
        matchUpScheduleCourtIds,
        overLimitMatchUpIds,
        matchUpScheduleTimes,
        matchUpDependencies,
        matchUpDailyLimits,
        courtIdsScheduled,
        requestConflicts,
        allDateMatchUpIds,
        personRequests,
        periodLength,
        scheduleDate,
        bumpLimits,
        dateCourts,
        matchUp,
        details,
        venueId,
      });

      if (result.skipped) continue;

      if (result.scheduled) {
        const { matchUpId, courtId, booking } = result;
        matchUpIdsScheduled.push(matchUpId);
        courtIdsScheduled.push(courtId);

        addDateCourtBooking({ courtId, booking });

        details.matchUpsToSchedule = details.matchUpsToSchedule.filter((matchUp) => matchUp.matchUpId !== matchUpId);
      }
    }

    if (
      courtIdsScheduled.length === details.courtsCount ||
      matchUpIdsScheduled.length === details.courtsCount ||
      !details.matchUpsToSchedule.length
    ) {
      venuePassComplete = true;
    }

    // this is necessary for scenarios where there are more courts than matches which can be scheduled at the same time
    passIterations += 1;
    if (!venuePassComplete && passIterations >= venuePassFailSafe) {
      venuePassComplete = true;
    }
  }

  return { matchUpIdsScheduled };
}

function scheduleVenueRounds({
  recoveryTimeDeferredMatchUpIds,
  checkPotentialRequestConflicts,
  dependencyDeferredMatchUpIds,
  matchUpPotentialParticipantIds,
  individualParticipantProfiles,
  scheduleDateRequestConflicts,
  venueScheduledRoundDetails,
  matchUpNotBeforeTimes,
  venueEarliestCourtTime,
  matchUpScheduleCourtIds,
  addDateCourtBooking,
  overLimitMatchUpIds,
  matchUpScheduleTimes,
  matchUpDependencies,
  matchUpDailyLimits,
  venueTimeBoundaries,
  requestConflicts,
  allDateMatchUpIds,
  personRequests,
  periodLength,
  scheduleDate,
  bumpLimits,
  dateCourts,
  venues,
}) {
  const failSafe = 10;
  let schedulingIterations = 0;
  let schedulingComplete;

  while (!schedulingComplete) {
    for (const { venueId } of venues) {
      const details = venueScheduledRoundDetails[venueId];

      const { matchUpIdsScheduled } = scheduleVenuePass({
        recoveryTimeDeferredMatchUpIds,
        checkPotentialRequestConflicts,
        dependencyDeferredMatchUpIds,
        matchUpPotentialParticipantIds,
        individualParticipantProfiles,
        scheduleDateRequestConflicts,
        matchUpNotBeforeTimes,
        venueEarliestCourtTime,
        matchUpScheduleCourtIds,
        addDateCourtBooking,
        overLimitMatchUpIds,
        matchUpScheduleTimes,
        matchUpDependencies,
        matchUpDailyLimits,
        requestConflicts,
        allDateMatchUpIds,
        personRequests,
        periodLength,
        scheduleDate,
        bumpLimits,
        dateCourts,
        details,
        venueId,
      });

      if (details.matchUpsToSchedule.length && matchUpIdsScheduled < details.courtsCount) {
        if (timeToDate(venueEarliestCourtTime) < timeToDate(venueTimeBoundaries.endTime)) {
          venueEarliestCourtTime = addMinutesToTimeString(venueEarliestCourtTime, periodLength);
        } else {
          details.complete = true;
        }
      }

      if (!details.matchUpsToSchedule?.length) details.complete = true;
    }

    schedulingIterations += 1;
    schedulingComplete =
      venues.every(({ venueId }) => venueScheduledRoundDetails[venueId].complete) || schedulingIterations === failSafe;
  }

  return venueEarliestCourtTime;
}

function computeRoundSchedulingStats({ dateSchedulingProfile, scheduledMatchUpIds, scheduleDate }) {
  for (const venue of dateSchedulingProfile.venues) {
    for (const round of venue.rounds) {
      const matchUpIds = (round.matchUps ?? []).map(({ matchUpId }) => matchUpId);
      const canScheduleMatchUpIds = matchUpIds?.filter((matchUpId) =>
        scheduledMatchUpIds[scheduleDate].includes(matchUpId),
      );
      round.canScheduledMatchUpIds = canScheduleMatchUpIds;
      let possibleToSchedulePct: any =
        Math.round(((canScheduleMatchUpIds?.length || 0) / round.matchUpsCount) * 10000) / 100;
      if (possibleToSchedulePct === Infinity || isNaN(possibleToSchedulePct)) possibleToSchedulePct = undefined;
      round.possibleToSchedulePct = possibleToSchedulePct;
      if (round.matchUpsCount === canScheduleMatchUpIds?.length) {
        round.possibleToSchedule = true;
      }
    }
  }
}

type V2Scheduler = {
  matchUpDependencies: { [key: string]: any };
  checkPotentialRequestConflicts?: boolean;
  tournamentRecords: TournamentRecords;
  scheduleCompletedMatchUps?: boolean;
  schedulingProfileModifications: any;
  excludeNoDateCompleted?: boolean;
  personRequests?: PersonRequests;
  containedStructureIds: string[];
  schedulingProfileIssues?: any[];
  dateSchedulingProfiles: any[];
  matchUps?: HydratedMatchUp[];
  excludePriorDates?: boolean;
  clearScheduleDates?: boolean;
  matchUpDailyLimits?: any;
  courts: HydratedCourt[];
  schedulingProfile?: any;
  periodLength?: number;
  dryRun?: boolean;
};

export function v2Scheduler({
  schedulingProfileModifications,
  checkPotentialRequestConflicts,
  scheduleCompletedMatchUps, // override which can be used by mocksEngine
  excludeNoDateCompleted,
  schedulingProfileIssues,
  dateSchedulingProfiles,
  containedStructureIds,
  matchUpDependencies,
  matchUpDailyLimits,
  excludePriorDates,
  clearScheduleDates,
  tournamentRecords,
  periodLength = 30,
  schedulingProfile,
  personRequests,
  matchUps = [],
  courts,
  dryRun,
}: V2Scheduler) {
  const recoveryTimeDeferredMatchUpIds = {};
  const dependencyDeferredMatchUpIds = {};
  const scheduleDateRequestConflicts = {};
  const matchUpScheduleCourtIds = {};
  const matchUpScheduleTimes = {};
  const scheduledMatchUpIds = {};
  const overLimitMatchUpIds = {};
  const noTimeMatchUpIds = {};
  const requestConflicts = {};

  // Start SCHEDULING
  for (const dateSchedulingProfile of dateSchedulingProfiles ?? []) {
    const scheduleDate = extractDate(dateSchedulingProfile?.scheduleDate);
    const venues = dateSchedulingProfile?.venues ?? [];
    const matchUpPotentialParticipantIds = {};
    const individualParticipantProfiles = {};

    const bumpLimits = (relevantParticipantIds, matchUpType) => {
      relevantParticipantIds.forEach((participantId) => {
        const counters = individualParticipantProfiles[participantId].counters;
        if (counters[matchUpType]) counters[matchUpType] += 1;
        else counters[matchUpType] = 1;
        if (counters[TOTAL]) counters[TOTAL] += 1;
        else counters[TOTAL] = 1;
      });
    };

    recoveryTimeDeferredMatchUpIds[scheduleDate] = {};
    dependencyDeferredMatchUpIds[scheduleDate] = {};
    scheduledMatchUpIds[scheduleDate] = []; // will not be in scheduled order
    overLimitMatchUpIds[scheduleDate] = [];
    noTimeMatchUpIds[scheduleDate] = [];
    requestConflicts[scheduleDate] = [];

    // Build up matchUpNotBeforeTimes for all matchUps already scheduled on scheduleDate
    const matchUpNotBeforeTimes = {};
    matchUps?.forEach((matchUp) => {
      if (matchUp.schedule?.scheduledDate && sameDay(scheduleDate, extractDate(matchUp.schedule.scheduledDate))) {
        processNextMatchUps({
          matchUpPotentialParticipantIds,
          matchUpNotBeforeTimes,
          matchUp,
        });
      }
    });

    const {
      allDateScheduledByeMatchUpDetails,
      allDateScheduledMatchUpIds,
      venueScheduledRoundDetails,
      allDateMatchUpIds,
    } = getVenueSchedulingDetails({
      matchUpPotentialParticipantIds,
      individualParticipantProfiles,
      scheduleCompletedMatchUps,
      excludeNoDateCompleted,
      containedStructureIds,
      matchUpNotBeforeTimes,
      matchUpScheduleTimes,
      matchUpDependencies,
      excludePriorDates,
      clearScheduleDates,
      tournamentRecords,
      periodLength,
      scheduleDate,
      matchUps,
      courts,
      venues,
    });
    const dateScheduledMatchUps = matchUps?.filter(({ matchUpId }) => allDateScheduledMatchUpIds.includes(matchUpId));

    const { bookings } = generateBookings({
      dateScheduledMatchUps,
      tournamentRecords,
      scheduleDate,
      periodLength,
    });

    const { virtualCourts: dateCourts } = generateVirtualCourts({
      scheduleDate,
      periodLength,
      bookings,
      courts,
    });

    const venueTimeBoundaries = dateCourts?.reduce((timeBoundaries, court) => {
      const { earliestCourtTime, courtEndTime } = getEarliestCourtTime({
        date: scheduleDate,
        averageMinutes: 0,
        court,
      });

      if (!timeBoundaries.startTime || timeToDate(earliestCourtTime) < timeToDate(timeBoundaries.startTime)) {
        timeBoundaries.startTime = earliestCourtTime;
      }

      if (!timeBoundaries.endTime || timeToDate(courtEndTime) > timeToDate(timeBoundaries.endTime)) {
        timeBoundaries.endTime = courtEndTime;
      }

      return timeBoundaries;
    }, {});

    let venueEarliestCourtTime = venueTimeBoundaries.startTime;

    const addDateCourtBooking = ({ courtId, booking }) =>
      dateCourts?.find((court) => court.courtId === courtId)?.dateAvailability[0].bookings.push(booking);

    scheduleVenueRounds({
      recoveryTimeDeferredMatchUpIds,
      checkPotentialRequestConflicts,
      dependencyDeferredMatchUpIds,
      matchUpPotentialParticipantIds,
      individualParticipantProfiles,
      scheduleDateRequestConflicts,
      venueScheduledRoundDetails,
      matchUpNotBeforeTimes,
      venueEarliestCourtTime,
      matchUpScheduleCourtIds,
      addDateCourtBooking,
      overLimitMatchUpIds,
      matchUpScheduleTimes,
      matchUpDependencies,
      matchUpDailyLimits,
      venueTimeBoundaries,
      requestConflicts,
      allDateMatchUpIds,
      personRequests,
      periodLength,
      scheduleDate,
      bumpLimits,
      dateCourts,
      venues,
    });

    applyScheduleResults({
      venueScheduledRoundDetails,
      matchUpScheduleCourtIds,
      scheduledMatchUpIds,
      matchUpScheduleTimes,
      noTimeMatchUpIds,
      tournamentRecords,
      scheduleDate,
      venues,
      dryRun,
    });

    if (!dryRun && allDateScheduledByeMatchUpDetails?.length) {
      // remove scheduling information for BYE matchUps from any rounds that were scheduled
      bulkScheduleMatchUps({
        matchUpDetails: allDateScheduledByeMatchUpDetails,
        scheduleByeMatchUps: true,
        removePriorValues: true,
        tournamentRecords,
        schedule: {
          scheduledDate: '',
          scheduledTime: '',
          courtOrder: '',
          courtId: '',
          venueId: '',
        },
      });
    }

    computeRoundSchedulingStats({ dateSchedulingProfile, scheduledMatchUpIds, scheduleDate });
  }

  // returns the original form of the dateStrings, before extractDate()
  const scheduledDates = (dateSchedulingProfiles ?? []).map(({ scheduleDate }) => scheduleDate);

  const autoSchedulingAudit = {
    timeStamp: Date.now(),
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
    dateSchedulingProfiles,

    recoveryTimeDeferredMatchUpIds,
    dependencyDeferredMatchUpIds,
    matchUpScheduleTimes,
    overLimitMatchUpIds,
    scheduledMatchUpIds,
    noTimeMatchUpIds,
    requestConflicts,
    scheduledDates,
  };
}
