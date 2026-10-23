import { getParticipantReachability, ParticipantReachability } from '../scheduleMatchUps/getParticipantReachability';
import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { getPersonRequests } from '@Query/matchUps/scheduling/getPersonRequests';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { getMatchUpDailyLimits } from '@Query/extensions/getMatchUpDailyLimits';
import { getSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { findMatchUpFormatTiming } from '@Acquire/findMatchUpFormatTiming';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { extractDate, isValidDateString } from '@Tools/dateTime';
import { isConvertableInteger, isPowerOf2 } from '@Tools/math';
import { matchUpSort } from '@Functions/sorters/matchUpSort';
import { filterMatchUps } from '@Query/filterMatchUps';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { BYE, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { ErrorType, NO_VALID_DATES } from '@Constants/errorConditionConstants';
import { HydratedCourt, HydratedMatchUp } from '@Types/hydrated';
import { DO_NOT_SCHEDULE } from '@Constants/requestConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { Tournament } from '@Types/tournamentTypes';

/**
 * vNext, stage one: the read-only VIEW a scheduling call is decided from (SCHEDULING_PIPELINE_VNEXT.md § 7; the rules
 * are `documentation/docs/concepts/scheduling-pipeline.md` § 1 and § 3). Built once per call, so nothing downstream
 * re-hydrates, rebuilds a graph or re-resolves a round (§ 7.0, design rule 1). Nothing here writes.
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
  periodLength: number;
  error?: ErrorType;
};
export type VenuePlan = { venueId: string; rounds: RoundPlan[] };
export type DatePlan = { scheduleDate: string; venues: VenuePlan[] };

export type SchedulingView = {
  tournamentRecords: { [tournamentId: string]: Tournament };
  matchUpDependencies: ReturnType<typeof getMatchUpDependencies>['matchUpDependencies'];
  dailyLimitOverrides: ReturnType<typeof getMatchUpDailyLimits>['dailyLimitOverrides'];
  matchUpDailyLimits: ReturnType<typeof getMatchUpDailyLimits>['matchUpDailyLimits'];
  personRequests: ReturnType<typeof getPersonRequests>['personRequests'];
  /** the matchUps as hydrated for scheduling, in hydration order (the timed scheduler's own `matchUps`) */
  hydrated: HydratedMatchUp[];
  matchUps: Map<string, HydratedMatchUp>;
  reachability: ParticipantReachability;
  /** the courts the call may use: every court, enabled or not, narrowed to `courtIds` when the call names any */
  courts: HydratedCourt[];
  minutes: Map<string, Minutes>;
  dates: DatePlan[];
};

type BuildSchedulingViewArgs = {
  tournamentRecords: { [tournamentId: string]: Tournament };
  scheduleCompletedMatchUps?: boolean;
  scheduleDates?: string[];
  periodLength?: number;
  courtIds?: string[];
};

/** the profile's dates, in order, narrowed to `scheduleDates` when the call names any */
function profileDates(schedulingProfile: DateProfile[], scheduleDates: string[]): DateProfile[] {
  const named = new Set(scheduleDates.filter(isValidDateString).map((date) => extractDate(date)));
  return schedulingProfile
    .filter(({ scheduleDate }) => isValidDateString(scheduleDate))
    .map((dateProfile) => ({ ...dateProfile, scheduleDate: extractDate(dateProfile.scheduleDate) }))
    .filter(({ scheduleDate }) => !scheduleDates.length || named.has(scheduleDate))
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
    categoryName: category?.categoryName ?? category?.ageCategoryCode,
    categoryType: category?.categoryType,
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
  scheduleCompletedMatchUps,
  scheduleDates = [],
  tournamentRecords,
  periodLength = 30,
  courtIds,
}: BuildSchedulingViewArgs): SchedulingView | { error: ErrorType } {
  const { schedulingProfile = [] } = getSchedulingProfile({ tournamentRecords });
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
  const schedulable = (matchUp: HydratedMatchUp) =>
    matchUp.matchUpStatus !== BYE &&
    (scheduleCompletedMatchUps || !matchUp.matchUpStatus || !completedMatchUpStatuses.includes(matchUp.matchUpStatus));

  const minutes = new Map<string, Minutes>();
  const dates: DatePlan[] = dateProfiles.map((dateProfile) => {
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
          if (error) return { ...unscheduled, error };
          // a round none of whose matchUps has a format is not timed, and so schedules nothing (as v1)
          if (!roundTiming) return unscheduled;
          const profiledMatchUpIds = inRound.filter(schedulable).map(({ matchUpId }) => matchUpId);
          for (const matchUpId of profiledMatchUpIds) minutes.set(matchUpId, roundTiming);
          const matchUpIds = profiledMatchUpIds.filter((matchUpId) => !claimed.has(matchUpId));
          matchUpIds.forEach((matchUpId) => claimed.add(matchUpId));
          return { round, matchUpIds, profiledMatchUpIds, minutes: roundTiming, periodLength: roundPeriodLength };
        }),
      };
    });
    return { scheduleDate: dateProfile.scheduleDate, venues };
  });

  const allCourts: HydratedCourt[] = getVenuesAndCourts({ ignoreDisabled: false, tournamentRecords }).courts ?? [];
  const courts = Array.isArray(courtIds) ? allCourts.filter(({ courtId }) => courtIds.includes(courtId)) : allCourts;
  const { matchUpDailyLimits, dailyLimitOverrides } = getMatchUpDailyLimits({ tournamentRecords });
  const { personRequests } = getPersonRequests({ requestType: DO_NOT_SCHEDULE, tournamentRecords });

  return {
    matchUps: new Map(hydrated.map((matchUp) => [matchUp.matchUpId, matchUp])),
    matchUpDependencies,
    dailyLimitOverrides,
    matchUpDailyLimits,
    tournamentRecords,
    personRequests,
    reachability,
    hydrated,
    minutes,
    courts,
    dates,
  };
}
