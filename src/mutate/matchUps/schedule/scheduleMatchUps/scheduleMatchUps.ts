import { extractDate, extractTime, isValidDateString, sameDay, zeroPad } from '@Tools/dateTime';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { assignMatchUpVenue } from '@Mutate/matchUps/schedule/assignMatchUpVenue';
import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
import { getPersonRequests } from '@Query/matchUps/scheduling/getPersonRequests';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { resolveScheduleMatchUpsTiming } from './resolveScheduleMatchUpsTiming';
import { getParticipantReachability } from './getParticipantReachability';
import { checkDependenciesScheduled } from './checkDependenciesScheduled';
import { modifyParticipantDayMatchUps } from './participantDayLoad';
import { updateTimeAfterRecovery } from './updateTimeAfterRecovery';
import { calculateScheduleTimes } from './calculateScheduleTimes';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { checkRequestConflicts } from './checkRequestConflicts';
import { getMatchUpIds } from '@Functions/global/extractors';
import { processNextMatchUps } from './processNextMatchUps';
import { checkRecoveryTime } from './checkRecoveryTime';
import { checkDailyLimits } from './checkDailyLimits';

// constants
import { BYE, ABANDONED, DEFAULTED, RETIRED, WALKOVER, COMPLETED } from '@Constants/matchUpStatusConstants';
import { INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  AVERAGE_MATCHUP_MINUTES,
  INVALID,
  MATCHUP_IDS,
  PERIOD_LENGTH,
  RECOVERY_MINUTES,
  SCHEDULE_DATE,
  TOURNAMENT_RECORDS,
  VALIDATE,
} from '@Constants/attributeConstants';

/**
 *
 * @param {object[]} tournamentRecords - provided by competitionEngine
 * @param {string[]} matchUpIds - matchUpIds to schedule
 * @param {string[]} venueIds - venueIds of venues where dateAvailability for courts is found
 * @param {string} scheduleDate - YYYY-MM-DD string representing day on which matchUps should be scheduled
 * @param {string} startTime - 00:00 - military time string
 * @param {string} endTime - 00:00 - military time string
 *
 * @param {number} periodLength - granularity of time blocks to consider, in minutes
 * @param {number} averageMatchUpMinutes - how long the expected matchUps are expected to last, in minutes, on average
 * @param {number} recoveryMinutes - time in minutes that should be alloted for participants to recover between matches
 *   (when neither is stated, a timing in the tournament or the event decides; with none, 90 and 0)
 * @param {object} matchUpDailyLimits - { SINGLES, DOUBLES, TOTAL } - maximum number of matches allowed per participant
 * @param {boolean} checkPotentialRequestConflicts - check personRequests when person is only potentially in matchUp being scheduled
 *
 * @returns scheduledMatchUpIds, individualParticipantProfiles
 */
export function scheduleMatchUps(params) {
  const {
    tournamentRecords,
    allDateMatchUpIds: statedAllDateMatchUpIds,

    averageMatchUpMinutes: statedAverageMinutes,
    recoveryMinutes: statedRecoveryMinutes,
    recoveryMinutesMap: statedRecoveryMinutesMap, // for matchUpIds batched by averageMatchUpMinutes: varying recovery

    matchUpPotentialParticipantIds = {},
    individualParticipantProfiles = {},
    matchUpNotBeforeTimes = {},
    matchUpDailyLimits = {},

    checkPotentialRequestConflicts = true,
    remainingScheduleTimes,
    clearScheduleDates,

    periodLength = 30,
    scheduleDate,
    matchUpIds,
    venueIds,

    startTime,
    endTime,
    dryRun,
  } = params;
  const paramCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORDS]: true, [MATCHUP_IDS]: true },
    {
      [VALIDATE]: isValidDateString,
      [INVALID]: INVALID_DATE,
      [SCHEDULE_DATE]: true,
    },
    {
      [VALIDATE]: (value) => !value || !isNaN(value),
      [AVERAGE_MATCHUP_MINUTES]: false,
      [INVALID]: INVALID_VALUES,
      [RECOVERY_MINUTES]: false,
      [PERIOD_LENGTH]: false,
    },
  ]);
  if (paramCheck.error) return paramCheck;

  // if competitionMatchUps not provided as a parameter
  // scheduleMatchUpProfiles has already called processNextMatchUps for all
  const competitionMatchUps =
    params.competitionMatchUps ??
    allCompetitionMatchUps({
      nextMatchUps: true,
      tournamentRecords,
    }).matchUps ??
    [];

  const matchUpDependencies =
    params.matchUpDependencies ??
    getMatchUpDependencies({
      includeParticipantDependencies: true,
      matchUps: competitionMatchUps,
      tournamentRecords,
    }).matchUpDependencies;

  // who can play each matchUp, across dates: the basis of recovery bookings and daily limits
  const participantReachability = getParticipantReachability({ matchUpDependencies, matchUps: competitionMatchUps });

  competitionMatchUps.forEach((matchUp) => {
    if (matchUp.schedule?.scheduledDate && sameDay(scheduleDate, extractDate(matchUp.schedule.scheduledDate))) {
      processNextMatchUps({
        matchUpPotentialParticipantIds,
        matchUpNotBeforeTimes,
        matchUp,
      });
    }
  });

  // this must be done to preserve the order of matchUpIds
  const targetMatchUps = matchUpIds
    .map((matchUpId) => competitionMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId))
    .filter(Boolean);

  const dateMatchUps = competitionMatchUps.filter(
    (matchUp) => matchUp.schedule?.scheduledDate && sameDay(scheduleDate, extractDate(matchUp.schedule.scheduledDate)),
  );
  const { averageMatchUpMinutes, recoveryMinutes, recoveryMinutesMap } = resolveScheduleMatchUpsTiming({
    matchUps: [...targetMatchUps, ...dateMatchUps],
    averageMatchUpMinutes: statedAverageMinutes,
    recoveryMinutesMap: statedRecoveryMinutesMap,
    recoveryMinutes: statedRecoveryMinutes,
    tournamentRecords,
  });

  // determines court availability taking into account already scheduled matchUps on the scheduleDate
  // optimization to pass already retrieved competitionMatchUps to avoid refetch (requires refactor)
  const { venueId, scheduleTimes, dateScheduledMatchUpIds } = calculateScheduleTimes({
    tournamentRecords,
    remainingScheduleTimes,
    startTime: extractTime(startTime),
    endTime: extractTime(endTime),
    scheduleDate: extractDate(scheduleDate),
    averageMatchUpMinutes,
    clearScheduleDates,
    periodLength,
    venueIds,
  });
  // a source outside this set is not waited for (checkDependenciesScheduled). With none stated it is the matchUps being
  // scheduled and those already on the date: the empty default waited for nobody, so a final took the first free slot
  // before both its semifinals (C2, SCHEDULING_PIPELINE_VNEXT.md § 5)
  const allDateMatchUpIds: string[] = statedAllDateMatchUpIds ?? [...matchUpIds, ...(dateScheduledMatchUpIds ?? [])];
  const requestConflicts = {};
  const skippedScheduleTimes: string[] = [];
  const matchUpScheduleTimes = {};
  const recoveryTimeDeferred = {};
  const dependencyDeferred = {};

  // first build up a map of matchUpNotBeforeTimes and matchUpPotentialParticipantIds
  // based on already scheduled matchUps
  const dateScheduledMatchUps = competitionMatchUps.filter(({ matchUpId }) =>
    dateScheduledMatchUpIds?.includes(matchUpId),
  );
  dateScheduledMatchUps.forEach((matchUp) => {
    modifyParticipantDayMatchUps({
      reachability: participantReachability,
      individualParticipantProfiles,
      matchUp,
      value: 1,
    });
    const scheduleTime = matchUp.schedule?.scheduledTime;
    if (scheduleTime) {
      matchUpScheduleTimes[matchUp.matchUpId] = scheduleTime;
      const mappedRecoveryMinutes = recoveryMinutesMap?.[matchUp.matchUpId];
      updateTimeAfterRecovery({
        recoveryMinutes: mappedRecoveryMinutes || recoveryMinutes,
        matchUpPotentialParticipantIds,
        individualParticipantProfiles,
        matchUpNotBeforeTimes,
        averageMatchUpMinutes,
        reachability: participantReachability,
        scheduleTime,
        matchUp,
      });
    }
  });

  // matchUps are assumed to be in the desired order for scheduling
  let matchUpsToSchedule = targetMatchUps.filter((matchUp) => {
    const alreadyScheduled = dateScheduledMatchUpIds?.includes(matchUp.matchUpId);

    const doNotSchedule = [BYE, DEFAULTED, COMPLETED, ABANDONED, RETIRED, WALKOVER].includes(matchUp?.matchUpStatus);
    return !alreadyScheduled && !matchUp.winningSide && !doNotSchedule;
  });

  // for optimization, build up an object for each tournament and an array for each draw with target matchUps
  // keep track of matchUps counts per participant and don't add matchUps for participants beyond those limits
  const { matchUpMap, overLimitMatchUpIds, participantIdsAtLimit } = matchUpsToSchedule.reduce(
    (aggregator, matchUp) => {
      const { drawId, tournamentId } = matchUp;

      const { participantIdsAtLimit } = checkDailyLimits({
        reachability: participantReachability,
        individualParticipantProfiles,
        matchUpDailyLimits,
        matchUp,
      });

      if (participantIdsAtLimit?.length) {
        aggregator.overLimitMatchUpIds.push(matchUp.matchUpId);
        aggregator.participantIdsAtLimit.push(...participantIdsAtLimit);
        return aggregator;
      }

      modifyParticipantDayMatchUps({
        reachability: participantReachability,
        individualParticipantProfiles,
        value: 1,
        matchUp,
      });

      if (!aggregator.matchUpMap[tournamentId]) aggregator.matchUpMap[tournamentId] = {};
      if (!aggregator.matchUpMap[tournamentId][drawId]) {
        aggregator.matchUpMap[tournamentId][drawId] = [matchUp];
      } else {
        aggregator.matchUpMap[tournamentId][drawId].push(matchUp);
      }

      // since this matchUp is to be scheduled, update the matchUpPotentialParticipantIds
      processNextMatchUps({
        matchUpPotentialParticipantIds,
        matchUpNotBeforeTimes,
        matchUp,
      });

      return aggregator;
    },
    { matchUpMap: {}, overLimitMatchUpIds: [], participantIdsAtLimit: [] },
  );

  matchUpsToSchedule = matchUpsToSchedule.filter(({ matchUpId }) => !overLimitMatchUpIds.includes(matchUpId));

  let iterations = 0;
  const failSafe = scheduleTimes?.length ?? 0;

  const { personRequests } = getPersonRequests({
    tournamentRecords,
    requestType: DO_NOT_SCHEDULE,
  });

  // while there are still matchUps to schedule and scheduleTimes, assign scheduleTimes to matchUps;
  while (scheduleTimes?.length && matchUpsToSchedule.length && iterations <= failSafe) {
    iterations++;
    const { scheduleTime } = scheduleTimes.shift();

    // find a matchUp where all individual participants had enough recovery time
    const scheduledMatchUp = matchUpsToSchedule.find((matchUp) => {
      const { matchUpId } = matchUp;
      const { dependenciesScheduled, remainingDependencies } = checkDependenciesScheduled({
        matchUpScheduleTimes,
        matchUpDependencies,
        allDateMatchUpIds,
        matchUp,
      });
      if (!dependenciesScheduled) {
        if (!dependencyDeferred[matchUpId]) dependencyDeferred[matchUpId] = [];
        dependencyDeferred[matchUpId].push({
          scheduleTime,
          remainingDependencies,
        });
        return false;
      }

      const { enoughTime } = checkRecoveryTime({
        individualParticipantProfiles,
        matchUpNotBeforeTimes,
        reachability: participantReachability,
        scheduleTime,
        matchUp,
      });
      if (!enoughTime) {
        if (!recoveryTimeDeferred[matchUpId]) recoveryTimeDeferred[matchUpId] = [];
        recoveryTimeDeferred[matchUpId].push({
          scheduleTime,
        });
        return false;
      }

      const { conflicts } = checkRequestConflicts({
        potentials: checkPotentialRequestConflicts,
        averageMatchUpMinutes,
        requestConflicts,
        personRequests,
        scheduleTime,
        scheduleDate,
        matchUp,
      });

      if (conflicts?.length) return false;

      const mappedRecoveryMinutes = recoveryMinutesMap?.[matchUp.matchUpId];

      updateTimeAfterRecovery({
        recoveryMinutes: mappedRecoveryMinutes || recoveryMinutes,
        matchUpPotentialParticipantIds,
        individualParticipantProfiles,
        matchUpNotBeforeTimes,
        averageMatchUpMinutes,
        reachability: participantReachability,
        scheduleTime,
        matchUp,
      });

      matchUpScheduleTimes[matchUp.matchUpId] = scheduleTime;
      return true;
    });

    matchUpsToSchedule = matchUpsToSchedule.filter(({ matchUpId }) => matchUpId !== scheduledMatchUp?.matchUpId);

    if (!scheduledMatchUp) {
      skippedScheduleTimes.push(scheduleTime);
    }
  }

  // cleanup limits counters for matchUps which could not be scheduled due to recovery times
  matchUpsToSchedule.forEach((matchUp) => {
    modifyParticipantDayMatchUps({
      individualParticipantProfiles,
      reachability: participantReachability,
      value: -1,
      matchUp,
    });
  });

  const scheduledMatchUpIds: string[] = [];
  const refusedMatchUpIds: string[] = [];
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
            if (scheduleTime) {
              // must include scheduleDate being scheduled to generate proper ISO string
              const formatTime = scheduleTime.split(':').map(zeroPad).join(':');
              const scheduledTime = `${extractDate(scheduleDate)}T${formatTime}`;

              if (dryRun) {
                scheduledMatchUpIds.push(matchUpId);
              } else {
                const result = addMatchUpScheduledTime({
                  drawDefinition,
                  matchUpId,
                  scheduledTime,
                });
                // a refused write (a played matchUp it depends on is later) leaves the matchUp unscheduled, and no venue
                if (!result.success) {
                  refusedMatchUpIds.push(matchUpId);
                  return;
                }
                scheduledMatchUpIds.push(matchUpId);

                if (venueId) {
                  assignMatchUpVenue({
                    tournamentRecords,
                    tournamentRecord,
                    drawDefinition,
                    matchUpId,
                    venueId,
                  });
                }
              }
            }
          });
        }
      });
    }
  });

  const noTimeMatchUpIds = [...getMatchUpIds(matchUpsToSchedule), ...refusedMatchUpIds];

  return {
    ...SUCCESS,
    requestConflicts: Object.values(requestConflicts),
    remainingScheduleTimes: scheduleTimes?.map(({ scheduleTime }) => scheduleTime),
    individualParticipantProfiles,
    matchUpNotBeforeTimes,
    participantIdsAtLimit, // at the moment this is only those participants at limit BEFORE scheduling begins
    skippedScheduleTimes,
    overLimitMatchUpIds,
    scheduledMatchUpIds,
    noTimeMatchUpIds,

    recoveryTimeDeferred,
    dependencyDeferred,
  };
}
