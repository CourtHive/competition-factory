import type { IndividualParticipantProfiles } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkParticipantProfileInitialization';
import { checkDependenciesScheduled } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDependenciesScheduled';
import { checkDailyLimits, resolveDailyLimits } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDailyLimits';
import { modifyParticipantDayMatchUps } from '@Mutate/matchUps/schedule/scheduleMatchUps/participantDayLoad';
import { updateTimeAfterRecovery } from '@Mutate/matchUps/schedule/scheduleMatchUps/updateTimeAfterRecovery';
import { checkDependendantTiming } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDependentTiming';
import { checkRequestConflicts } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkRequestConflicts';
import type { DailyLimitOverrides } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDailyLimits';
import { checkRecoveryTime } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkRecoveryTime';

// constants and types
import type { ParticipantReachability } from '@Mutate/matchUps/schedule/scheduleMatchUps/getParticipantReachability';
import { PersonRequests, ScheduleTimesResult } from '@Types/factoryTypes';
import { TOTAL } from '@Constants/scheduleConstants';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * Places a date's profiled matchUps on its venues' Garman slots: each slot is offered to the venue's matchUps in order,
 * and the first to pass every gate (daily limits, dependent timing, dependencies, recovery, person requests) takes it.
 * Shared by v1's jinnScheduler and vNext's planner (SCHEDULING_PIPELINE_VNEXT.md § 7), which differ in how they build
 * the per-venue details, not in how a slot is filled. It writes only to the bookkeeping it is handed.
 */

type ByDate<T> = { [scheduleDate: string]: T };
type ScheduleTime = ScheduleTimesResult & { attempts?: number };
export type SkippedScheduleTime = { scheduleTime: string; attempts: number };
export type RecoveryDeferral = { scheduleTime: string } & Pick<
  ReturnType<typeof checkRecoveryTime>,
  'blockingParticipantIds' | 'notBeforeTime'
>;
export type DependencyDeferral = { scheduleTime: string; remainingDependencies: string[] };
type RequestConflict = NonNullable<ReturnType<typeof checkRequestConflicts>['conflicts']>[number];

/** a venue's slots and the matchUps still to place on them, on one date */
export type VenueRoundDetails = {
  minutesMap?: {
    [matchUpId: string]: { averageMinutes?: number; recoveryMinutes?: number; typeChangeRecoveryMinutes?: number };
  };
  matchUpsToSchedule: HydratedMatchUp[];
  greatestAverageMinutes?: number;
  scheduleTimes: ScheduleTime[];
  courtsCount: number;
  complete?: boolean;
};

export type PlaceVenueRoundsArgs = {
  recoveryTimeDeferredMatchUpIds: ByDate<{ [matchUpId: string]: RecoveryDeferral[] }>;
  dependencyDeferredMatchUpIds: ByDate<{ [matchUpId: string]: DependencyDeferral[] }>;
  skippedScheduleTimes: ByDate<{ [venueId: string]: SkippedScheduleTime[] }>;
  matchUpNotBeforeTimes: Parameters<typeof checkRecoveryTime>[0]['matchUpNotBeforeTimes'];
  venueScheduledRoundDetails: { [venueId: string]: VenueRoundDetails };
  overLimitMatchUpDetails: ByDate<OverLimitMatchUpDetail[]>;
  individualParticipantProfiles: IndividualParticipantProfiles;
  matchUpPotentialParticipantIds: { [matchUpId: string]: string[] };
  scheduleDateRequestConflicts: ByDate<RequestConflict[]>;
  matchUpDependencies: { [matchUpId: string]: { matchUpIds: string[] } };
  matchUpScheduleTimes: { [matchUpId: string]: string };
  matchUpDailyLimits?: { [counterName: string]: number };
  participantReachability: ParticipantReachability;
  checkPotentialRequestConflicts: boolean;
  dailyLimitOverrides?: DailyLimitOverrides;
  overLimitMatchUpIds: ByDate<string[]>;
  requestConflicts: ByDate<unknown[]>;
  personRequests?: PersonRequests;
  venues: { venueId: string }[];
  allDateMatchUpIds: string[];
  scheduleDate: string;
};

type TryScheduleMatchUpArgs = Omit<
  PlaceVenueRoundsArgs,
  'venueScheduledRoundDetails' | 'skippedScheduleTimes' | 'venues'
> & {
  details: VenueRoundDetails;
  matchUp: HydratedMatchUp;
  scheduleTime: string;
};

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
}: TryScheduleMatchUpArgs) {
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

export function scheduleVenueRounds({
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
}: PlaceVenueRoundsArgs) {
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
        const { scheduleTime, attempts = 0 } = details.scheduleTimes.shift() as ScheduleTime;
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
        skippedScheduleTimes[scheduleDate][venueId] = skippedScheduleTimes[scheduleDate][venueId]?.filter(
          (unused: SkippedScheduleTime) => {
            const tryAgain = unused.attempts < maxScheduleTimeAttempts;
            if (tryAgain) details.scheduleTimes.push(unused);
            return !tryAgain;
          },
        );
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
