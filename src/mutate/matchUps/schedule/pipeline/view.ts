import { getParticipantReachability, ParticipantReachability } from '../scheduleMatchUps/getParticipantReachability';
import { getSchedulingProfile, schedulingProfileRepairRefusal } from '@Mutate/tournaments/schedulingProfile';
import { EventBookingTimings, getEventBookingTimings } from '@Generators/scheduling/utils/generateBookings';
import { timedMatchUpMinutes } from '@Mutate/matchUps/schedule/schedulers/processAlreadyScheduledMatchUps';
import { DrawPlayedOrderFacts, drawPlayedOrderFacts } from '../scheduleItems/playedOrder';
import { defaultTransitMinutes, venueTransitPairs } from '@Query/venues/getVenueTransits';
import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { getPersonRequests } from '@Query/matchUps/scheduling/getPersonRequests';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { getMatchUpDailyLimits } from '@Query/extensions/getMatchUpDailyLimits';
import { findMatchUpFormatTiming } from '@Acquire/findMatchUpFormatTiming';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { hasByeSide } from '@Mutate/matchUps/schedule/byeScheduling';
import { eventDateResolver, EventDateReason } from '@Query/events/eventPlaysOnDate';
import { timingCategoryType } from '@Query/event/timingCategoryType';
import { timingCategoryName } from '@Query/event/timingCategoryName';
import { extractDate, isValidDateString } from '@Tools/dateTime';
import { isConvertableInteger, isPowerOf2 } from '@Tools/math';
import { definedAttributes } from '@Tools/definedAttributes';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { filterMatchUps } from '@Query/filterMatchUps';
import { addDaysToDate } from '@Tools/civilDateTime';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { ErrorType, NO_VALID_DATES } from '@Constants/errorConditionConstants';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { HydratedCourt, HydratedMatchUp } from '@Types/hydrated';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { Tournament } from '@Types/tournamentTypes';
import type { VenueTransit } from './transit';

/**
 * vNext, stage one: the read-only VIEW a scheduling call is decided from (SCHEDULING_PIPELINE_VNEXT.md § 7; the rules
 * are `documentation/docs/concepts/scheduling-pipeline.md` § 1 and § 3). Built once per call, so nothing downstream
 * re-hydrates, rebuilds a graph or re-resolves a round (§ 7.0, design rule 1). Nothing here writes, except the repair
 * profile validation makes to a stored profile whose rounds name a venue, event or draw that is gone (spec § 2).
 *
 * It reuses the engine's queries for what the spec states as inputs (hydration, the dependency graph, participant
 * reachability, format timing); what vNext re-implements is the orchestration over them. The round resolution below is
 * stated by the spec and pinned against v1's `getScheduledRoundsDetails` by `schedulingView.test.ts`.
 */

/** a scheduling profile's shapes, as the spec states them (§ 1) */
export type ProfileRound = {
  roundSegment?: { segmentNumber: number; segmentsCount: number };
  matchUpIds?: string[];
  periodLength?: number;
  tournamentId: string;
  structureId: string;
  roundNumber: number;
  sortOrder?: number;
  eventId: string;
  drawId: string;
};
type VenueProfile = { venueId: string; rounds?: ProfileRound[] };
type DateProfile = { scheduleDate: string; venues?: VenueProfile[] };

export type Minutes = { averageMinutes?: number; recoveryMinutes?: number; typeChangeRecoveryMinutes?: number };

export type RoundPlan = {
  round: ProfileRound;
  /** the round's schedulable matchUps, in order; those another venue already claims on the date are left out */
  matchUpIds: string[];
  /** the round's schedulable matchUps before any claim: they size the venue's slots and carry the round's minutes */
  profiledMatchUpIds: string[];
  /** absent when no matchUp of the round has a format: such a round schedules nothing */
  minutes?: Minutes;
  /** a round with no format: its schedulable matchUps not yet timed, which a run reports and does not place */
  noFormatMatchUpIds?: string[];
  periodLength: number;
  error?: ErrorType;
};
export type VenuePlan = { venueId: string; rounds: RoundPlan[] };
/** a profiled matchUp whose event does not play on the date (eventPlaysOnDate), and why */
export type EventDateSkip = { matchUpId: string; eventId: string; reason: EventDateReason };
export type DatePlan = { scheduleDate: string; venues: VenuePlan[] };

/**
 * What the PLANNER decides from, and all it reads: plain data resolved once from the records, so the plan is a function
 * of this alone (it can be built from a literal, or from a view a bug report attached). The one non-JSON member is
 * `reachability.upstream`, a Set per matchUp on the day-load hot path; `viewCodec.ts` carries it as an array.
 */
export type PlanningView = {
  matchUpDependencies: ReturnType<typeof getMatchUpDependencies>['matchUpDependencies'];
  dailyLimitOverrides: ReturnType<typeof getMatchUpDailyLimits>['dailyLimitOverrides'];
  matchUpDailyLimits: ReturnType<typeof getMatchUpDailyLimits>['matchUpDailyLimits'];
  personRequests: ReturnType<typeof getPersonRequests>['personRequests'];
  /** the matchUps as hydrated for scheduling, in hydration order (the timed scheduler's own `matchUps`) */
  hydrated: HydratedMatchUp[];
  reachability: ParticipantReachability;
  /** the courts the call may use: every court, enabled or not, narrowed to `courtIds` when the call names any */
  courts: HydratedCourt[];
  /** per planned date, the courts available that day (disabled venues and courts left out), which the slots are cut
   * from */
  dateCourts: { [scheduleDate: string]: HydratedCourt[] };
  /** every event's type and scheduling-policy timing: what an existing booking's length is read from */
  eventTimings: EventBookingTimings;
  /** the matchUps already timed on a planned date, their own minutes (format and event): their recovery holds their
   * participants */
  timedMinutes: { [matchUpId: string]: Minutes };
  /** per draw anyone has played in, its stored matchUps as the played order reads them */
  playedOrderFacts: { [drawId: string]: DrawPlayedOrderFacts };
  /** transit between venues (§ 3.4): the policy's default, any stated pairs, and which venues share a facility */
  transit?: VenueTransit;
  dates: DatePlan[];
};

/**
 * The view a call builds: the planner's, plus what only the entry and the write side read: the profile itself, the
 * records, and the matchUps by id.
 */
export type SchedulingView = PlanningView & {
  /** the profile as validated, and what validation changed and found (spec § 2) */
  schedulingProfile: DateProfile[];
  schedulingProfileModifications?: number;
  schedulingProfileIssues: string[];
  /** the profile's own date objects for the dates planned, in order */
  dateSchedulingProfiles: DateProfile[];
  tournamentRecords: { [tournamentId: string]: Tournament };
  matchUps: Map<string, HydratedMatchUp>;
  /**
   * per date, the profiled matchUps not yet timed whose event does not play on it: their rounds plan nothing on the date
   * (spec § 4, step 2). Here, not on the planning view, so the plan's contract does not change.
   */
  eventDateSkippedMatchUpIds: { [scheduleDate: string]: EventDateSkip[] };
  /** with `allowInactiveEventDates`: the same matchUps, planned all the same, which a run warns about when it places them */
  eventDateInactiveMatchUpIds: { [scheduleDate: string]: EventDateSkip[] };
};

type BuildSchedulingViewArgs = {
  tournamentRecords: { [tournamentId: string]: Tournament };
  /** plan a round on a date its event does not play, and warn, rather than skip it (default false) */
  allowInactiveEventDates?: boolean;
  scheduleDates?: string[];
  periodLength?: number;
  courtIds?: string[];
};

/**
 * The profile's dates, in order, narrowed to `scheduleDates` when the call names any. They are the profile's own
 * objects, as v1's `dateSchedulingProfiles` are: a run reports each round's share placed on them.
 */
function profileDates(schedulingProfile: DateProfile[], scheduleDates: string[]): DateProfile[] {
  const named = new Set(scheduleDates.filter(isValidDateString).map((date) => extractDate(date)));
  return schedulingProfile
    .filter(({ scheduleDate }) => isValidDateString(scheduleDate))
    .filter(({ scheduleDate }) => !scheduleDates.length || named.has(extractDate(scheduleDate)))
    .sort((a, b) => new Date(a.scheduleDate).getTime() - new Date(b.scheduleDate).getTime());
}

/**
 * A round's matchUps: its tournament, event, draw and round number, in its structure or in the groups a round robin
 * contains, limited to its `matchUpIds`, in matchUp order. A `roundSegment` takes its share by position, and only when
 * the round has a power-of-two count of matchUps, the segment count is a power of two smaller than it, and the round
 * does not list `matchUpIds`.
 */
function roundMatchUps(
  round: ProfileRound,
  matchUps: HydratedMatchUp[],
  containedStructures: Record<string, string[]>,
) {
  const structureIds = containedStructures[round.structureId] ?? [round.structureId];
  let inRound: HydratedMatchUp[] = filterMatchUps({
    tournamentIds: [round.tournamentId],
    roundNumbers: [round.roundNumber],
    matchUpIds: round.matchUpIds,
    eventIds: [round.eventId],
    drawIds: [round.drawId],
    processContext: true,
    structureIds,
    matchUps,
  }).sort(matchUpSort);

  // absent, both are 0: a segment number of 0 is never a segment, exactly as an absent one is not
  const { segmentNumber = 0, segmentsCount = 0 } = round.roundSegment ?? {};
  const segmented =
    isConvertableInteger(segmentNumber) &&
    isPowerOf2(inRound.length) &&
    isPowerOf2(segmentsCount) &&
    segmentNumber > 0 &&
    segmentNumber <= segmentsCount &&
    segmentsCount < inRound.length &&
    !round.matchUpIds?.length;
  if (segmented) {
    const size = inRound.length / segmentsCount;
    inRound = inRound.slice(size * (segmentNumber - 1), size * segmentNumber);
  }
  return inRound;
}

/**
 * A round's minutes, from its event's category and the format of the round's FIRST matchUp, applied to all of its
 * matchUps: v1 resolves the first format it meets and returns (C7 in the plan, OPEN: a round of mixed formats is timed
 * by its first). An unresolvable format is the round's error.
 */
function roundMinutes(
  round: ProfileRound,
  inRound: HydratedMatchUp[],
  tournamentRecords: BuildSchedulingViewArgs['tournamentRecords'],
) {
  const matchUpFormat = inRound.find(({ matchUpFormat }) => matchUpFormat)?.matchUpFormat;
  if (!matchUpFormat) return { minutes: undefined };
  const tournamentRecord = tournamentRecords[round.tournamentId];
  const event = tournamentRecord ? findEvent({ tournamentRecord, drawId: round.drawId }).event : undefined;
  const { eventType, category } = event ?? {};
  const timing = findMatchUpFormatTiming({
    categoryName: timingCategoryName(event),
    categoryType: timingCategoryType(category),
    tournamentId: round.tournamentId,
    eventId: round.eventId,
    tournamentRecords,
    matchUpFormat,
    eventType,
  });
  if ('error' in timing) return { error: timing.error };
  const { averageMinutes, recoveryMinutes, typeChangeRecoveryMinutes } = timing;
  return { minutes: { averageMinutes, recoveryMinutes, typeChangeRecoveryMinutes } };
}

export function buildSchedulingView({
  allowInactiveEventDates = false,
  scheduleDates = [],
  tournamentRecords,
  periodLength = 30,
  courtIds,
}: BuildSchedulingViewArgs): SchedulingView | { error: ErrorType; context?: Record<string, unknown> } {
  // a stored profile that needs repair (a round whose venue, event or draw is gone) is refused, with the repaired profile
  // offered for the caller to save: the view writes nothing (CA 2026-10-23)
  const profileResult = getSchedulingProfile({ tournamentRecords });
  if (profileResult.error) return { error: profileResult.error };
  if (profileResult.modifications) return schedulingProfileRepairRefusal(profileResult) as { error: ErrorType };
  const { schedulingProfile = [], modifications, issues = [] } = profileResult;
  const dateProfiles = profileDates(schedulingProfile, scheduleDates);
  if (schedulingProfile.length && !dateProfiles.length) return { error: NO_VALID_DATES };

  // hydrated as the timed scheduler reads them: singles and doubles (a TEAM dual's tie matchUps are what is scheduled),
  // with each schedule's time after recovery, which seeds the not-before times of the matchUps it feeds
  const hydrated =
    allCompetitionMatchUps({
      matchUpFilters: { matchUpTypes: [SINGLES, DOUBLES] },
      afterRecoveryTimes: true,
      nextMatchUps: true,
      tournamentRecords,
    }).matchUps ?? [];
  const { matchUpDependencies } = getMatchUpDependencies({
    includeParticipantDependencies: true,
    matchUps: hydrated,
    tournamentRecords,
  });
  const reachability = getParticipantReachability({ matchUpDependencies, matchUps: hydrated });
  const containedStructures: Record<string, string[]> = Object.assign(
    {},
    ...Object.values(tournamentRecords).map(
      (tournamentRecord) => getContainedStructures({ tournamentRecord }).containedStructures,
    ),
  );
  // a completed matchUp is never scheduled again (CA 2026-10-23)
  const schedulable = (matchUp: HydratedMatchUp) =>
    !hasByeSide(matchUp) && (!matchUp.matchUpStatus || !completedMatchUpStatuses.includes(matchUp.matchUpStatus));

  // a round whose event does not play on the date plans nothing there; its matchUps not yet timed are reported, per event
  const resolveEventDate = eventDateResolver(tournamentRecords);
  const eventDateSkippedMatchUpIds: SchedulingView['eventDateSkippedMatchUpIds'] = {};
  const eventDateInactiveMatchUpIds: SchedulingView['eventDateInactiveMatchUpIds'] = {};

  const dates: DatePlan[] = dateProfiles.map((dateProfile) => {
    const scheduleDate = extractDate(dateProfile.scheduleDate);
    const skipped = (eventDateSkippedMatchUpIds[scheduleDate] = [] as EventDateSkip[]);
    const inactive = (eventDateInactiveMatchUpIds[scheduleDate] = [] as EventDateSkip[]);
    // a matchUp belongs to the first venue that profiles it on the date
    const claimed = new Set<string>();
    const venues: VenuePlan[] = (dateProfile.venues ?? []).filter(Boolean).map((venue) => {
      const rounds = (venue.rounds ?? []).toSorted((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));
      return {
        venueId: venue.venueId,
        rounds: rounds.map((round): RoundPlan => {
          const inRound = roundMatchUps(round, hydrated, containedStructures);
          const roundPeriodLength = round.periodLength || periodLength;
          const { minutes: roundTiming, error } = roundMinutes(round, inRound, tournamentRecords);
          const unscheduled = { round, matchUpIds: [], profiledMatchUpIds: [], periodLength: roundPeriodLength };
          const verdict = resolveEventDate({
            tournamentId: round.tournamentId,
            eventId: round.eventId,
            date: scheduleDate,
          });
          if (!verdict.plays) {
            const skips = inRound
              .filter((matchUp) => schedulable(matchUp) && !matchUp.schedule?.scheduledTime)
              .map(({ matchUpId }) => ({ matchUpId, eventId: round.eventId, reason: verdict.reason }));
            if (!allowInactiveEventDates) {
              skipped.push(...skips);
              return unscheduled;
            }
            inactive.push(...skips);
          }
          if (error) return { ...unscheduled, error };
          // a round none of whose matchUps has a format is not timed, and so schedules nothing; its matchUps not yet
          // timed are reported (CA 2026-10-23)
          if (!roundTiming) {
            const noFormatMatchUpIds = inRound
              .filter((matchUp) => schedulable(matchUp) && !matchUp.schedule?.scheduledTime)
              .map(({ matchUpId }) => matchUpId);
            return { ...unscheduled, noFormatMatchUpIds };
          }
          const profiledMatchUpIds = inRound.filter(schedulable).map(({ matchUpId }) => matchUpId);
          const matchUpIds = profiledMatchUpIds.filter((matchUpId) => !claimed.has(matchUpId));
          matchUpIds.forEach((matchUpId) => claimed.add(matchUpId));
          return { round, matchUpIds, profiledMatchUpIds, minutes: roundTiming, periodLength: roundPeriodLength };
        }),
      };
    });
    return { scheduleDate, venues };
  });

  const allCourts: HydratedCourt[] = getVenuesAndCourts({ ignoreDisabled: false, tournamentRecords }).courts ?? [];
  const courts = Array.isArray(courtIds) ? allCourts.filter(({ courtId }) => courtIds.includes(courtId)) : allCourts;
  const { matchUpDailyLimits, dailyLimitOverrides } = getMatchUpDailyLimits({ tournamentRecords });
  const { personRequests } = getPersonRequests({ requestType: DO_NOT_SCHEDULE, tournamentRecords });
  const dateCourts = Object.fromEntries(
    dates.map(({ scheduleDate }) => [
      scheduleDate,
      getVenuesAndCourts({ dates: [scheduleDate], ignoreDisabled: true, tournamentRecords }).courts ?? [],
    ]),
  );

  return {
    matchUps: new Map(hydrated.map((matchUp) => [matchUp.matchUpId, matchUp])),
    schedulingProfileModifications: modifications,
    dateSchedulingProfiles: dateProfiles,
    schedulingProfileIssues: issues,
    matchUpDependencies,
    dailyLimitOverrides,
    matchUpDailyLimits,
    tournamentRecords,
    schedulingProfile,
    personRequests,
    timedMinutes: timedMinutesOf(hydrated, dates, tournamentRecords),
    eventDateInactiveMatchUpIds,
    eventDateSkippedMatchUpIds,
    playedOrderFacts: playedOrderFactsOf(tournamentRecords),
    eventTimings: getEventBookingTimings(tournamentRecords),
    transit: venueTransit(tournamentRecords),
    reachability,
    dateCourts,
    hydrated,
    courts,
    dates,
  };
}

/**
 * The minutes of every matchUp already timed on a planned date or on the day before one, from its own format and event:
 * a recovery on the day before that runs past midnight carries into the planned date (§ 9.8)
 */
function timedMinutesOf(
  hydrated: HydratedMatchUp[],
  dates: DatePlan[],
  tournamentRecords: { [tournamentId: string]: Tournament },
) {
  const planned = new Set(
    dates.flatMap(({ scheduleDate }) => [scheduleDate, addDaysToDate(scheduleDate, -1) ?? scheduleDate]),
  );
  const memo = new Map<string, Minutes | undefined>();
  const timedMinutes: PlanningView['timedMinutes'] = {};
  for (const matchUp of hydrated) {
    const { scheduledDate, scheduledTime } = matchUp.schedule ?? {};
    if (!scheduledTime || !planned.has(extractDate(scheduledDate))) continue;
    const minutes = timedMatchUpMinutes({ tournamentRecords, matchUp, memo });
    if (minutes) {
      const { averageMinutes, recoveryMinutes, typeChangeRecoveryMinutes } = minutes;
      timedMinutes[matchUp.matchUpId] = { averageMinutes, recoveryMinutes, typeChangeRecoveryMinutes };
    }
  }
  return timedMinutes;
}

/** the played order's stored facts for every draw anyone has played in; a draw nobody has played in imposes nothing */
function playedOrderFactsOf(tournamentRecords: { [tournamentId: string]: Tournament }) {
  const facts: PlanningView['playedOrderFacts'] = {};
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    for (const event of tournamentRecord.events ?? []) {
      for (const drawDefinition of event.drawDefinitions ?? []) {
        const drawFacts = drawPlayedOrderFacts(drawDefinition);
        if (drawFacts) facts[drawDefinition.drawId] = drawFacts;
      }
    }
  }
  return facts;
}

/**
 * Transit between the records' venues (§ 3.4): the stated pairs by direction (`scheduling.venueTransits`), the venues that
 * share a facility (none between them), and the attached scheduling policy's `defaultTimes.transitMinutes` for a pair with
 * no stated minutes (no policy stating it, no transit). Absent when nothing applies, so a view without transit plans as
 * before.
 */
function venueTransit(tournamentRecords: { [tournamentId: string]: Tournament }): VenueTransit | undefined {
  const facilityIds: { [venueId: string]: string } = {};
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    for (const venue of tournamentRecord.venues ?? [])
      if (venue.facilityId) facilityIds[venue.venueId] = venue.facilityId;
  }
  const pairs = venueTransitPairs(tournamentRecords);
  const transit: VenueTransit = definedAttributes({
    facilityIds: Object.keys(facilityIds).length ? facilityIds : undefined,
    pairs: Object.keys(pairs).length ? pairs : undefined,
    defaultMinutes: defaultTransitMinutes(tournamentRecords),
  });
  return Object.keys(transit).length ? transit : undefined;
}
