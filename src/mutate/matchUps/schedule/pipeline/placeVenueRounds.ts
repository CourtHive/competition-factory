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
import type { VenueTransit } from './transit';

/**
 * Places a date's profiled matchUps on its venues' Garman slots: each slot is offered to the venue's matchUps in order,
 * and the first to pass every gate (daily limits, played order, dependent timing, dependencies, recovery, person
 * requests) takes it.
 * Moved unchanged from v1's jinnScheduler into the planner (SCHEDULING_PIPELINE_VNEXT.md § 7). It writes only to the
 * bookkeeping it is handed.
 */

type ByDate<T> = { [scheduleDate: string]: T };
type ScheduleTime = ScheduleTimesResult & { attempts?: number };
export type SkippedScheduleTime = { scheduleTime: string; attempts: number };
export type RecoveryDeferral = { scheduleTime: string } & Pick<
  ReturnType<typeof checkRecoveryTime>,
  'blockingParticipantIds' | 'notBeforeTime'
>;
export type DependencyDeferral = { scheduleTime: string; remainingDependencies: string[] };
/** the first slot a matchUp was refused for the played order, and the played matchUps that refused it */
export type PlayedOrderDeferral = { scheduleTime: string; blockingMatchUps: unknown[] };
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
  playedOrderDeferredMatchUpIds: ByDate<{ [matchUpId: string]: PlayedOrderDeferral }>;
  /** the played matchUps that would refuse this placement (spec § 3.7), or undefined when none would */
  playedOrderRefusal: (matchUp: HydratedMatchUp, scheduleTime: string) => unknown[] | undefined;
  dependencyDeferredMatchUpIds: ByDate<{ [matchUpId: string]: DependencyDeferral[] }>;
  skippedScheduleTimes: ByDate<{ [venueId: string]: SkippedScheduleTime[] }>;
  matchUpNotBeforeTimes: Parameters<typeof checkRecoveryTime>[0]['matchUpNotBeforeTimes'];
  venueScheduledRoundDetails: { [venueId: string]: VenueRoundDetails };
  overLimitMatchUpDetails: ByDate<OverLimitMatchUpDetail[]>;
  individualParticipantProfiles: IndividualParticipantProfiles;
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
  /** transit between venues (§ 3.4): absent, none applies */
  transit?: VenueTransit;
};

type TryScheduleMatchUpArgs = Omit<
  PlaceVenueRoundsArgs,
  'venueScheduledRoundDetails' | 'skippedScheduleTimes' | 'venues'
> & {
  details: VenueRoundDetails;
  matchUp: HydratedMatchUp;
  scheduleTime: string;
  venueId: string;
};

function tryScheduleMatchUp({
  checkPotentialRequestConflicts,
  recoveryTimeDeferredMatchUpIds,
  playedOrderDeferredMatchUpIds,
  playedOrderRefusal,
  dependencyDeferredMatchUpIds,
  individualParticipantProfiles,
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
  transit,
  venueId,
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

  // a slot at or before a played source, or at or after a played dependent, is never taken (CA 2026-10-23): the plan
  // holds the rule the writer's guard asks, so the guard does not fire on a plan made here
  const blockingMatchUps = playedOrderRefusal(matchUp, scheduleTime);
  if (blockingMatchUps) {
    playedOrderDeferredMatchUpIds[scheduleDate][matchUpId] ??= { scheduleTime, blockingMatchUps };
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
    transit,
    venueId,
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

  // a placed matchUp holds its participants, and checks their requests, for its own minutes: its round's average, the
  // same figure its recovery is checked with (§ 3.4, § 3.6; CA 2026-10-25), never the venue's greatest
  const averageMatchUpMinutes = details.minutesMap?.[matchUpId]?.averageMinutes ?? details.greatestAverageMinutes;

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
    individualParticipantProfiles,
    matchUpNotBeforeTimes,
    averageMatchUpMinutes,
    reachability: participantReachability,
    recoveryMinutes,
    scheduleTime,
    venueId,
    matchUp,
  });

  matchUpScheduleTimes[matchUpId] = scheduleTime;

  return true;
}

export function scheduleVenueRounds({
  checkPotentialRequestConflicts,
  recoveryTimeDeferredMatchUpIds,
  playedOrderDeferredMatchUpIds,
  dependencyDeferredMatchUpIds,
  individualParticipantProfiles,
  scheduleDateRequestConflicts,
  venueScheduledRoundDetails,
  playedOrderRefusal,
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
  transit,
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
        scheduledThisPass < details.courtsCount
      ) {
        const { scheduleTime, attempts = 0 } = details.scheduleTimes.shift() as ScheduleTime;
        const scheduledMatchUp = details.matchUpsToSchedule.find((matchUp) =>
          tryScheduleMatchUp({
            checkPotentialRequestConflicts,
            recoveryTimeDeferredMatchUpIds,
            playedOrderDeferredMatchUpIds,
            playedOrderRefusal,
            dependencyDeferredMatchUpIds,
            individualParticipantProfiles,
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
            transit,
            venueId,
            details,
            matchUp,
          }),
        );

        // a matchUp over a daily limit stays over it for the rest of the date (a participant's day only gains
        // matchUps while slots are filled), so it is asked once and reported once (CA 2026-10-23), not at every slot
        const overLimit = overLimitMatchUpIds[scheduleDate];
        details.matchUpsToSchedule = details.matchUpsToSchedule.filter(
          ({ matchUpId }) => matchUpId !== scheduledMatchUp?.matchUpId && !overLimit.includes(matchUpId),
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

// Capture the explanation for an over-limit refusal, once per matchUp per date: which
// participants on the matchUp are at the cap, which counters (matchUpType / TOTAL) they
// have hit and at what value, and the first time it was offered. Pushed in addition to
// the flat overLimitMatchUpIds array so existing consumers continue to work; the drawer
// reads this when present.
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
