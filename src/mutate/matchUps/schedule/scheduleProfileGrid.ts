import { getSchedulingProfile, schedulingProfileRepairRefusal } from '@Mutate/tournaments/schedulingProfile';
import { proAutoSchedule } from '@Mutate/matchUps/schedule/schedulers/proScheduler/proAutoSchedule';
import { overnightRestWarningsFor } from '@Query/matchUps/scheduling/getOvernightRestWarnings';
import { clearScheduledMatchUps } from '@Mutate/matchUps/schedule/clearScheduledMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { getMatchUpDailyLimits } from '@Query/extensions/getMatchUpDailyLimits';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { extractDate, isValidDateString } from '@Tools/dateTime';

// constants and types
import { ARRAY, OF_TYPE, SCHEDULE_DATES, TOURNAMENT_RECORDS, VALIDATE } from '@Constants/attributeConstants';
import { BYE, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { NO_VALID_DATES } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type ScheduleProfileGridArgs = {
  tournamentRecords: TournamentRecords;
  matchUpDailyLimits?: { [key: string]: number };
  /**
   * @deprecated ignored: completed matchUps are never scheduled (CA 2026-10-23). Removed at the next major.
   */
  scheduleCompletedMatchUps?: boolean;
  clearScheduleDates?: boolean | string[];
  minCourtGridRows?: number;
  scheduleDates?: string[];
  courtIds?: string[];
};

type RoundProfile = {
  structureId: string;
  roundNumber: number;
  drawId: string;
  roundSegment?: { segmentsCount: number; segmentNumber: number };
};

function getSegmentMatchUpIds(
  allMatchUps: HydratedMatchUp[],
  structureId: string,
  roundNumber: number,
  drawId: string,
  segmentsCount: number,
  segmentNumber: number,
): string[] {
  const roundMatchUps = allMatchUps.filter(
    (rm) => rm.structureId === structureId && rm.roundNumber === roundNumber && rm.drawId === drawId,
  );
  const chunkSize = Math.ceil(roundMatchUps.length / segmentsCount);
  const sortedIds = roundMatchUps
    .sort((a, b) => (a.roundPosition ?? 0) - (b.roundPosition ?? 0))
    .map((rm) => rm.matchUpId);
  const segStart = (segmentNumber - 1) * chunkSize;
  return sortedIds.slice(segStart, segStart + chunkSize);
}

function findRoundMatchUps(
  roundProfile: RoundProfile,
  allMatchUps: HydratedMatchUp[],
  containedStructureIds: Record<string, string>,
): HydratedMatchUp[] {
  const { structureId, roundNumber, drawId, roundSegment } = roundProfile;
  // a matchUp is in the profiled structure, or in a group the profiled structure contains
  const inProfiledStructure = (m: HydratedMatchUp) =>
    m.structureId === structureId || containedStructureIds[m.structureId] === structureId;

  const segmentIds = roundSegment
    ? new Set(
        getSegmentMatchUpIds(
          allMatchUps,
          structureId,
          roundNumber,
          drawId,
          roundSegment.segmentsCount,
          roundSegment.segmentNumber,
        ),
      )
    : null;

  return allMatchUps.filter((m: any) => {
    if (m.matchUpStatus === BYE) return false;
    // a completed matchUp is never placed (CA 2026-10-23): it needs no court, and would push new placements down
    if (completedMatchUpStatuses.includes(m.matchUpStatus)) return false;
    if (m.schedule?.courtId) return false;
    if (m.schedule?.courtOrder) return false;
    if (m.roundNumber !== roundNumber) return false;
    if (m.drawId !== drawId) return false;

    if (!inProfiledStructure(m)) return false;

    return segmentIds ? segmentIds.has(m.matchUpId) : true;
  });
}

function resolveTargetCourtIds(dateCourtIds: string[], courtIdsFilter: Set<string> | null): string[] | undefined {
  if (courtIdsFilter) return dateCourtIds;
  return dateCourtIds.length ? dateCourtIds : undefined;
}

function collectVenuePlan(
  dateProfile: any,
  courtsByVenue: Map<string, string[]>,
  courtIdsFilter: Set<string> | null,
  allMatchUps: HydratedMatchUp[],
  containedStructureIds: Record<string, string>,
): { dateMatchUps: HydratedMatchUp[]; dateCourtIds: string[]; courtlessMatchUps: HydratedMatchUp[] } {
  const courtlessMatchUps: HydratedMatchUp[] = [];
  const dateMatchUps: HydratedMatchUp[] = [];
  const dateCourtIds: string[] = [];

  for (const venueProfile of dateProfile.venues ?? []) {
    const allVenueCourtIds = courtsByVenue.get(venueProfile.venueId) ?? [];
    const venueCourtIds = courtIdsFilter ? allVenueCourtIds.filter((id) => courtIdsFilter.has(id)) : allVenueCourtIds;
    dateCourtIds.push(...venueCourtIds);

    // a venue with no courts keeps its rounds and places nothing (CA 2026-10-23): its matchUps are not offered to the
    // date's other courts, and are reported not scheduled
    const target = allVenueCourtIds.length ? dateMatchUps : courtlessMatchUps;
    for (const roundProfile of venueProfile.rounds ?? []) {
      target.push(...findRoundMatchUps(roundProfile, allMatchUps, containedStructureIds));
    }
  }

  return { dateMatchUps, dateCourtIds, courtlessMatchUps };
}

/**
 * The limits the grid applies (CA 2026-10-23: the schedulers agree on the policies applied). None given: those the
 * timed pipeline resolves (the policy's, the tournament's, each participant's override), enforced. `{}` given: the
 * caller opted out, and the same limits are asked only to warn. Limits given: those, enforced.
 */
function gridDailyLimits(
  matchUpDailyLimits: ScheduleProfileGridArgs['matchUpDailyLimits'],
  tournamentRecords: TournamentRecords,
) {
  const waived = !!matchUpDailyLimits && !Object.keys(matchUpDailyLimits).length;
  if (matchUpDailyLimits && !waived) return { limits: { matchUpDailyLimits, dailyLimitOverrides: undefined }, waived };
  const { matchUpDailyLimits: resolved, dailyLimitOverrides } = getMatchUpDailyLimits({ tournamentRecords });
  return { limits: { matchUpDailyLimits: resolved, dailyLimitOverrides }, waived };
}

/**
 * Profile-driven grid scheduling (pro scheduling).
 *
 * Uses the scheduling profile to determine which rounds go on which dates
 * at which venues, then calls proAutoSchedule for each date to assign
 * matchUps to court grid positions (courtOrder) WITHOUT assigning times.
 *
 * Rounds are processed in profile order, ensuring dependency correctness.
 * Each venue's courts are used as the target for its rounds.
 */
export function scheduleProfileGrid(params: ScheduleProfileGridArgs) {
  const {
    matchUpDailyLimits,
    minCourtGridRows = 10,
    clearScheduleDates,
    scheduleDates = [],
    tournamentRecords,
    courtIds,
  } = params;

  const courtIdsFilter = Array.isArray(courtIds) ? new Set(courtIds) : null;

  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORDS]: true },
    {
      [VALIDATE]: (value) => !value || (Array.isArray(value) && value.every((element) => isValidDateString(element))),
      [SCHEDULE_DATES]: false,
      [OF_TYPE]: ARRAY,
    },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const result = getSchedulingProfile({ tournamentRecords });
  if (result.error) return result;
  // a profile that needs repair is refused before anything is written, the repaired profile offered (CA 2026-10-23)
  if (result.modifications) return schedulingProfileRepairRefusal(result);

  if (!result.schedulingProfile.length) return { ...SUCCESS };

  const { schedulingProfile = [] } = result;

  // a round robin's groups are contained in the structure its profile rounds name: each group's container, by group.
  // This was the container -> groups map read as group -> container, so a round profiled on a round robin never found
  // a matchUp and the grid placed none of it (C6, SCHEDULING_PIPELINE_VNEXT.md § 5)
  const containedStructureIds: Record<string, string> = Object.assign(
    {},
    ...Object.values(tournamentRecords).map(
      (tournamentRecord) => getContainedStructures({ tournamentRecord }).containerStructures,
    ),
  );

  // Validate and filter schedule dates
  const validScheduleDates = new Set(
    scheduleDates.map((d) => (isValidDateString(d) ? extractDate(d) : undefined)).filter(Boolean),
  );

  const profileDates = schedulingProfile
    .map((dsp) => dsp.scheduleDate)
    .map((d) => isValidDateString(d) && extractDate(d))
    .filter((d) => d && (!scheduleDates.length || validScheduleDates.has(d)));

  if (!profileDates.length) return { error: NO_VALID_DATES };

  // Optionally clear existing schedules
  if (clearScheduleDates) {
    const scheduledDates = Array.isArray(clearScheduleDates) ? clearScheduleDates : [];
    clearScheduledMatchUps({ tournamentRecords, scheduledDates });
  }

  // Get all matchUps with context
  const { matchUps: allMatchUps } = allCompetitionMatchUps({
    matchUpFilters: { matchUpTypes: [SINGLES, DOUBLES] },
    nextMatchUps: true,
    tournamentRecords,
  });

  // Get courts grouped by venue
  const { courts: allCourts } = getVenuesAndCourts({
    ignoreDisabled: false,
    tournamentRecords,
  });
  const courtsByVenue = new Map<string, string[]>();
  for (const court of allCourts ?? []) {
    const venueId = court.venueId;
    if (!courtsByVenue.has(venueId)) courtsByVenue.set(venueId, []);
    courtsByVenue.get(venueId)?.push(court.courtId);
  }

  // Filter profile to valid dates and sort chronologically
  const dateProfiles = schedulingProfile
    .filter((dsp) => {
      const d = extractDate(dsp?.scheduleDate);
      return profileDates.includes(d);
    })
    .sort((a, b) => new Date(a.scheduleDate).getTime() - new Date(b.scheduleDate).getTime());

  const { limits, waived } = gridDailyLimits(matchUpDailyLimits, tournamentRecords);

  // Track results per date
  const dailyLimitWarningMatchUpIds: Record<string, string[]> = {};
  const scheduledMatchUpIds: Record<string, string[]> = {};
  const notScheduledMatchUpIds: Record<string, string[]> = {};
  const overLimitMatchUpIds: Record<string, string[]> = {};
  const scheduledDates: string[] = [];
  const reports = {
    dailyLimitWarnings: dailyLimitWarningMatchUpIds,
    notScheduled: notScheduledMatchUpIds,
    overLimit: overLimitMatchUpIds,
    scheduled: scheduledMatchUpIds,
  };

  for (const dateProfile of dateProfiles) {
    const scheduledDate = extractDate(dateProfile.scheduleDate);

    // Collect matchUps for this date based on profile round ordering
    const { dateMatchUps, dateCourtIds, courtlessMatchUps } = collectVenuePlan(
      dateProfile,
      courtsByVenue,
      courtIdsFilter,
      allMatchUps ?? [],
      containedStructureIds,
    );

    const courtlessIds = courtlessMatchUps.map(({ matchUpId }) => matchUpId);
    if (courtlessIds.length) notScheduledMatchUpIds[scheduledDate] = courtlessIds;
    if (!dateMatchUps.length) continue;
    // When the caller has explicitly filtered courts and nothing remains for
    // this date's venues, skip — falling back to "all courts" would defeat
    // the filter.
    // a date skipped still reports its matchUps as not scheduled: they vanished from the result before (C5,
    // SCHEDULING_PIPELINE_VNEXT.md § 5)
    const skipDate = () => {
      notScheduledMatchUpIds[scheduledDate] = [...dateMatchUps.map(({ matchUpId }) => matchUpId), ...courtlessIds];
    };
    if (courtIdsFilter && !dateCourtIds.length) {
      skipDate();
      continue;
    }

    // Run proAutoSchedule for this date with the collected matchUps.
    // BYE / completed filtering already happened in `findRoundMatchUps` above,
    // so the scheduler is fed the pre-filtered set.
    const gridResult = proAutoSchedule({
      courtIds: resolveTargetCourtIds(dateCourtIds, courtIdsFilter),
      matchUpDailyLimits: limits.matchUpDailyLimits,
      dailyLimitOverrides: limits.dailyLimitOverrides,
      overnightRestWarnings: false,
      dailyLimitsWarnOnly: waived,
      minCourtGridRows,
      tournamentRecords,
      matchUps: dateMatchUps,
      scheduledDate,
    });

    if (gridResult.error) {
      skipDate();
      continue;
    }

    const dateScheduledIds = (gridResult.scheduled ?? []).map((m) => m.matchUpId);
    if (dateScheduledIds.length) scheduledDates.push(scheduledDate);
    const dateResult = {
      notScheduled: [...(gridResult.notScheduled ?? []).map((m) => m.matchUpId), ...courtlessIds],
      dailyLimitWarnings: gridResult.dailyLimitWarningMatchUpIds ?? [],
      overLimit: gridResult.overLimitMatchUpIds ?? [],
      scheduled: dateScheduledIds,
    };
    for (const [key, ids] of Object.entries(dateResult)) {
      if (ids.length) reports[key as keyof typeof reports][scheduledDate] = ids;
    }
  }

  // overnight rest is warned, not held (§ 9.8): measured for a placement with a time (a court order alone has none)
  const overnightRestWarnings = overnightRestWarningsFor({ scheduleDates: scheduledDates, tournamentRecords });

  return {
    ...SUCCESS,
    scheduledMatchUpIds,
    notScheduledMatchUpIds,
    dailyLimitWarningMatchUpIds,
    overnightRestWarnings,
    overLimitMatchUpIds,
    scheduledDates,
  };
}
