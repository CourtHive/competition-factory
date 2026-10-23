import { processAlreadyScheduledMatchUps } from '@Mutate/matchUps/schedule/schedulers/processAlreadyScheduledMatchUps';
import { getMatchUpsToSchedule } from '@Mutate/matchUps/schedule/scheduleMatchUps/getMatchUpsToSchedule';
import { processNextMatchUps } from '@Mutate/matchUps/schedule/scheduleMatchUps/processNextMatchUps';
import { PlaceVenueRoundsArgs, scheduleVenueRounds, VenueRoundDetails } from './placeVenueRounds';
import { generateScheduleTimes } from '@Generators/scheduling/utils/generateScheduleTimes';
import { extractDate, sameDay, timeStringMinutes } from '@Tools/dateTime';
import { getMatchUpId } from '@Functions/global/extractors';
import { playedOrderGate } from './playedOrderGate';

// types
import type { DatePlan, Minutes, SchedulingView, VenuePlan } from './view';
import { ScheduleTimesResult } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * vNext, stage two: the PLAN. From the view alone it decides, date by date, which profiled matchUps take which slot,
 * and writes nothing: the records are only read, and every booking is kept in the plan's own bookkeeping. It replaced v1's
 * timed scheduler (jinnScheduler) after a differential held the two to the same placements across the corpus and the
 * scale matrix; the corpus manifest now pins them (SCHEDULING_PIPELINE_VNEXT.md § 7).
 *
 * A date runs as spec § 3 states it: the matchUps already on the date book their participants and recovery first; each
 * venue's slots are sized by the greatest average minutes among its rounds; then the venues' slots are filled in turn
 * (`placeVenueRounds`).
 */

type PlanScheduleArgs = {
  view: SchedulingView;
  checkPotentialRequestConflicts?: boolean;
  clearScheduleDates?: boolean | string[];
  excludeNoDateCompleted?: boolean;
  excludePriorDates?: boolean;
  /** the call's own period length: absent, a venue's slots derive theirs from its average minutes */
  periodLength?: number;
};

type ByDate<T> = { [scheduleDate: string]: T };
/** a venue's matchUps to place, by tournament and draw: the order v1 writes them in */
type MatchUpMap = { [tournamentId: string]: { [drawId: string]: HydratedMatchUp[] } };

export type SchedulePlan = {
  /** every matchUp's time on the dates planned: those already timed there, and those the plan places */
  matchUpScheduleTimes: { [matchUpId: string]: string };
  /** the matchUps the plan places, per date, in v1's write order (venue, tournament, draw, profile order) */
  scheduledMatchUpIds: ByDate<string[]>;
  /** placements per date and venue */
  placements: ByDate<{ [venueId: string]: { matchUpId: string; scheduleTime: string }[] }>;
  /** profiled matchUps no slot took, per date and venue */
  unplaced: ByDate<{ [venueId: string]: string[] }>;
  /** profiled matchUps no slot took, per date: each venue's in turn */
  noTimeMatchUpIds: ByDate<string[]>;
  /** matchUps of profiled rounds with no format, per date: not placed, since they cannot be timed */
  noFormatMatchUpIds: ByDate<string[]>;
  overLimitMatchUpIds: PlaceVenueRoundsArgs['overLimitMatchUpIds'];
  overLimitMatchUpDetails: PlaceVenueRoundsArgs['overLimitMatchUpDetails'];
  recoveryTimeDeferredMatchUpIds: PlaceVenueRoundsArgs['recoveryTimeDeferredMatchUpIds'];
  /** matchUps left unplaced because every slot offered them was at or before a played source (or at or after a
   * played dependent): the first such slot and the played matchUps that refused it */
  playedOrderDeferredMatchUpIds: PlaceVenueRoundsArgs['playedOrderDeferredMatchUpIds'];
  dependencyDeferredMatchUpIds: PlaceVenueRoundsArgs['dependencyDeferredMatchUpIds'];
  requestConflicts: PlaceVenueRoundsArgs['requestConflicts'];
  skippedScheduleTimes: PlaceVenueRoundsArgs['skippedScheduleTimes'];
  scheduleTimesRemaining: ByDate<{ [venueId: string]: ScheduleTimesResult[] }>;
};

/** a venue's slots are sized by the greatest average among its timed rounds; absent when none profiles a matchUp */
function venueAverageMinutes(venue: VenuePlan) {
  const timed = venue.rounds.filter((round) => round.minutes);
  const greatestAverageMinutes = Math.max(0, ...timed.map((round) => round.minutes?.averageMinutes || 0));
  const profilesAny = timed.some((round) => round.profiledMatchUpIds.length);
  return { greatestAverageMinutes, slotMinutes: profilesAny ? greatestAverageMinutes : undefined };
}

/** the minutes of the matchUps a venue's rounds profile, as the venue's slot filling and recovery read them */
function venueMinutesMap(venue: VenuePlan) {
  const minutesMap: { [matchUpId: string]: Minutes } = {};
  for (const round of venue.rounds) {
    if (!round.minutes) continue;
    for (const matchUpId of round.profiledMatchUpIds) minutesMap[matchUpId] = round.minutes;
  }
  return minutesMap;
}

export function planSchedule({
  checkPotentialRequestConflicts = true,
  excludeNoDateCompleted = true,
  excludePriorDates = true,
  clearScheduleDates,
  periodLength,
  view,
}: PlanScheduleArgs): SchedulePlan {
  const plan: SchedulePlan = {
    recoveryTimeDeferredMatchUpIds: {},
    playedOrderDeferredMatchUpIds: {},
    dependencyDeferredMatchUpIds: {},
    overLimitMatchUpDetails: {},
    scheduleTimesRemaining: {},
    skippedScheduleTimes: {},
    matchUpScheduleTimes: {},
    overLimitMatchUpIds: {},
    scheduledMatchUpIds: {},
    noFormatMatchUpIds: {},
    noTimeMatchUpIds: {},
    requestConflicts: {},
    placements: {},
    unplaced: {},
  };
  // request conflicts found across dates; v1 keeps them and reports none of them
  const scheduleDateRequestConflicts: PlaceVenueRoundsArgs['scheduleDateRequestConflicts'] = {};

  for (const datePlan of view.dates) {
    planDate({
      checkPotentialRequestConflicts,
      scheduleDateRequestConflicts,
      excludeNoDateCompleted,
      clearScheduleDates,
      excludePriorDates,
      periodLength,
      datePlan,
      plan,
      view,
    });
  }

  return plan;
}

type PlanDateArgs = Omit<PlanScheduleArgs, 'checkPotentialRequestConflicts'> & {
  checkPotentialRequestConflicts: boolean;
  scheduleDateRequestConflicts: PlaceVenueRoundsArgs['scheduleDateRequestConflicts'];
  datePlan: DatePlan;
  plan: SchedulePlan;
};

function planDate({
  checkPotentialRequestConflicts,
  scheduleDateRequestConflicts,
  excludeNoDateCompleted,
  clearScheduleDates,
  excludePriorDates,
  periodLength,
  datePlan,
  plan,
  view,
}: PlanDateArgs) {
  const { scheduleDate } = datePlan;
  const { hydrated, tournamentRecords, matchUpDependencies, reachability } = view;

  plan.recoveryTimeDeferredMatchUpIds[scheduleDate] = {};
  plan.playedOrderDeferredMatchUpIds[scheduleDate] = {};
  plan.dependencyDeferredMatchUpIds[scheduleDate] = {};
  plan.scheduleTimesRemaining[scheduleDate] = {};
  plan.skippedScheduleTimes[scheduleDate] = {};
  plan.overLimitMatchUpDetails[scheduleDate] = [];
  plan.overLimitMatchUpIds[scheduleDate] = [];
  plan.scheduledMatchUpIds[scheduleDate] = [];
  plan.noTimeMatchUpIds[scheduleDate] = [];
  plan.requestConflicts[scheduleDate] = [];
  plan.noFormatMatchUpIds[scheduleDate] = [
    ...new Set(datePlan.venues.flatMap((venue) => venue.rounds.flatMap((round) => round.noFormatMatchUpIds ?? []))),
  ];
  plan.placements[scheduleDate] = {};
  plan.unplaced[scheduleDate] = {};

  // the date's bookkeeping: who may yet play each matchUp, each participant's day, and when each matchUp may start
  const matchUpPotentialParticipantIds: PlaceVenueRoundsArgs['matchUpPotentialParticipantIds'] = {};
  const individualParticipantProfiles: PlaceVenueRoundsArgs['individualParticipantProfiles'] = {};
  const matchUpNotBeforeTimes: PlaceVenueRoundsArgs['matchUpNotBeforeTimes'] = {};
  for (const matchUp of hydrated) {
    if (matchUp.schedule?.scheduledDate && sameDay(scheduleDate, extractDate(matchUp.schedule.scheduledDate))) {
      processNextMatchUps({ matchUpPotentialParticipantIds, matchUpNotBeforeTimes, matchUp });
    }
  }

  // every matchUp profiled on the date, at any venue: a dependency outside it is not waited for
  const allDateMatchUpIds = datePlan.venues.flatMap((venue) => venue.rounds.flatMap((round) => round.matchUpIds));

  const venueScheduledRoundDetails: { [venueId: string]: VenueRoundDetails & { matchUpMap?: MatchUpMap } } = {};
  for (const venue of datePlan.venues) {
    const { greatestAverageMinutes, slotMinutes } = venueAverageMinutes(venue);
    const minutesMap = venueMinutesMap(venue);
    const venueCourts = view.courts.filter((court) => court.venueId === venue.venueId);

    // the venue's slots, around what is already booked on its courts that day
    const { scheduleTimes = [], dateScheduledMatchUpIds } = generateScheduleTimes({
      courtIds: venueCourts.map((court) => court.courtId),
      averageMatchUpMinutes: slotMinutes,
      venueIds: [venue.venueId],
      matchUps: hydrated,
      clearScheduleDates,
      tournamentRecords,
      periodLength,
      scheduleDate,
    });

    const already = processAlreadyScheduledMatchUps({
      matchUpScheduleTimes: plan.matchUpScheduleTimes,
      participantReachability: reachability,
      dateScheduledMatchUpIds: dateScheduledMatchUpIds as string[],
      matchUpPotentialParticipantIds,
      individualParticipantProfiles,
      excludeNoDateCompleted,
      greatestAverageMinutes,
      matchUpNotBeforeTimes,
      matchUpDependencies,
      clearScheduleDates,
      excludePriorDates,
      tournamentRecords,
      matchUps: hydrated,
      scheduleDate,
      minutesMap,
    });

    const { matchUpsToSchedule = [], matchUpMap } = getMatchUpsToSchedule({
      orderedMatchUpIds: venue.rounds.flatMap((round) => round.matchUpIds),
      dateScheduledMatchUpIds: already.dateScheduledMatchUpIds,
      matchUpScheduleTimes: plan.matchUpScheduleTimes,
      matchUpPotentialParticipantIds,
      clearDate: already.clearDate,
      matchUpNotBeforeTimes,
      matchUps: hydrated,
    });

    venueScheduledRoundDetails[venue.venueId] = {
      courtsCount: venueCourts.length,
      greatestAverageMinutes,
      matchUpsToSchedule,
      scheduleTimes,
      minutesMap,
      matchUpMap,
    };
  }

  scheduleVenueRounds({
    recoveryTimeDeferredMatchUpIds: plan.recoveryTimeDeferredMatchUpIds,
    playedOrderDeferredMatchUpIds: plan.playedOrderDeferredMatchUpIds,
    playedOrderRefusal: playedOrderGate(view, scheduleDate),
    dependencyDeferredMatchUpIds: plan.dependencyDeferredMatchUpIds,
    overLimitMatchUpDetails: plan.overLimitMatchUpDetails,
    matchUpScheduleTimes: plan.matchUpScheduleTimes,
    skippedScheduleTimes: plan.skippedScheduleTimes,
    overLimitMatchUpIds: plan.overLimitMatchUpIds,
    dailyLimitOverrides: view.dailyLimitOverrides,
    matchUpDailyLimits: view.matchUpDailyLimits,
    requestConflicts: plan.requestConflicts,
    personRequests: view.personRequests,
    participantReachability: reachability,
    venues: datePlan.venues,
    checkPotentialRequestConflicts,
    individualParticipantProfiles,
    matchUpPotentialParticipantIds,
    scheduleDateRequestConflicts,
    venueScheduledRoundDetails,
    matchUpNotBeforeTimes,
    matchUpDependencies,
    allDateMatchUpIds,
    scheduleDate,
  });

  recordDatePlacements({ venueScheduledRoundDetails, scheduleDate, datePlan, plan });
}

type RecordDatePlacementsArgs = {
  venueScheduledRoundDetails: { [venueId: string]: VenueRoundDetails & { matchUpMap?: MatchUpMap } };
  scheduleDate: string;
  datePlan: DatePlan;
  plan: SchedulePlan;
};

/** what each venue placed, in v1's write order, what it could not, and the slots it left */
function recordDatePlacements({ venueScheduledRoundDetails, scheduleDate, datePlan, plan }: RecordDatePlacementsArgs) {
  for (const { venueId } of datePlan.venues) {
    const details = venueScheduledRoundDetails[venueId];
    const placements: { matchUpId: string; scheduleTime: string }[] = [];
    for (const drawMatchUps of Object.values(details.matchUpMap ?? {}).flatMap((draws) => Object.values(draws))) {
      for (const { matchUpId } of drawMatchUps) {
        const scheduleTime = plan.matchUpScheduleTimes[matchUpId];
        if (scheduleTime) placements.push({ matchUpId, scheduleTime });
      }
    }
    plan.placements[scheduleDate][venueId] = placements;
    plan.scheduledMatchUpIds[scheduleDate].push(...placements.map(getMatchUpId));
    plan.unplaced[scheduleDate][venueId] = details.matchUpsToSchedule.map(getMatchUpId);
    // a matchUp the played order held back is reported under that reason alone; one a later slot took is not reported
    const playedOrderDeferred = plan.playedOrderDeferredMatchUpIds[scheduleDate];
    for (const { matchUpId } of placements) delete playedOrderDeferred[matchUpId];
    plan.noTimeMatchUpIds[scheduleDate].push(
      ...plan.unplaced[scheduleDate][venueId].filter((matchUpId) => !playedOrderDeferred[matchUpId]),
    );
    plan.scheduleTimesRemaining[scheduleDate][venueId] = details.scheduleTimes.toSorted(
      (a, b) => timeStringMinutes(a.scheduleTime) - timeStringMinutes(b.scheduleTime),
    );
  }
}
