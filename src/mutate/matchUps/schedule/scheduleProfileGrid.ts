import { proAutoSchedule } from '@Mutate/matchUps/schedule/schedulers/proScheduler/proAutoSchedule';
import { clearScheduledMatchUps } from '@Mutate/matchUps/schedule/clearScheduledMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getContainedStructures } from '@Query/drawDefinition/getContainedStructures';
import { allCompetitionMatchUps } from '@Query/matchUps/getAllCompetitionMatchUps';
import { getSchedulingProfile } from '@Mutate/tournaments/schedulingProfile';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { extractDate, isValidDateString } from '@Tools/dateTime';

// constants and types
import { ARRAY, OF_TYPE, SCHEDULE_DATES, TOURNAMENT_RECORDS, VALIDATE } from '@Constants/attributeConstants';
import { BYE, completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { NO_VALID_DATES } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type ScheduleProfileGridArgs = {
  tournamentRecords: TournamentRecords;
  matchUpDailyLimits?: { [key: string]: number };
  scheduleCompletedMatchUps?: boolean;
  clearScheduleDates?: boolean;
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
  allMatchUps: any[],
  structureId: string,
  roundNumber: number,
  drawId: string,
  segmentsCount: number,
  segmentNumber: number,
): string[] {
  const roundMatchUps = allMatchUps.filter(
    (rm: any) => rm.structureId === structureId && rm.roundNumber === roundNumber && rm.drawId === drawId,
  );
  const chunkSize = Math.ceil(roundMatchUps.length / segmentsCount);
  const sortedIds = roundMatchUps
    .sort((a: any, b: any) => (a.roundPosition ?? 0) - (b.roundPosition ?? 0))
    .map((rm: any) => rm.matchUpId);
  const segStart = (segmentNumber - 1) * chunkSize;
  return sortedIds.slice(segStart, segStart + chunkSize);
}

function findRoundMatchUps(
  roundProfile: RoundProfile,
  allMatchUps: any[],
  containedStructureIds: Record<string, string>,
  scheduleCompletedMatchUps?: boolean,
): any[] {
  const { structureId, roundNumber, drawId, roundSegment } = roundProfile;
  const effectiveStructureId = containedStructureIds[structureId] ?? structureId;

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
    // Completed matchUps from earlier sessions must not be carried into the
    // pro scheduler — they don't need placement and would otherwise occupy
    // grid rows, pushing newly-scheduled matchUps down. mocksEngine and a
    // few other callers explicitly opt back in via scheduleCompletedMatchUps.
    if (!scheduleCompletedMatchUps && completedMatchUpStatuses.includes(m.matchUpStatus)) return false;
    if (m.schedule?.courtId) return false;
    if (m.schedule?.courtOrder) return false;
    if (m.roundNumber !== roundNumber) return false;
    if (m.drawId !== drawId) return false;

    const mStructureId = containedStructureIds[m.structureId] ?? m.structureId;
    if (mStructureId !== effectiveStructureId) return false;

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
  allMatchUps: any[],
  containedStructureIds: Record<string, string>,
  scheduleCompletedMatchUps?: boolean,
): { dateMatchUps: any[]; dateCourtIds: string[] } {
  const dateMatchUps: any[] = [];
  const dateCourtIds: string[] = [];

  for (const venueProfile of dateProfile.venues ?? []) {
    const allVenueCourtIds = courtsByVenue.get(venueProfile.venueId) ?? [];
    const venueCourtIds = courtIdsFilter ? allVenueCourtIds.filter((id) => courtIdsFilter.has(id)) : allVenueCourtIds;
    dateCourtIds.push(...venueCourtIds);

    for (const roundProfile of venueProfile.rounds ?? []) {
      dateMatchUps.push(
        ...findRoundMatchUps(roundProfile, allMatchUps, containedStructureIds, scheduleCompletedMatchUps),
      );
    }
  }

  return { dateMatchUps, dateCourtIds };
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
    scheduleCompletedMatchUps,
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

  if (!result.schedulingProfile.length) return { ...SUCCESS };

  const { schedulingProfile = [] } = result;

  // Resolve contained structures for round robin
  const containedStructureIds = Object.assign(
    {},
    ...Object.values(tournamentRecords).map(
      (tournamentRecord) => getContainedStructures({ tournamentRecord }).containedStructures,
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
  for (const court of (allCourts as any[]) ?? []) {
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

  // Track results per date
  const scheduledMatchUpIds: Record<string, string[]> = {};
  const notScheduledMatchUpIds: Record<string, string[]> = {};
  const overLimitMatchUpIds: Record<string, string[]> = {};
  const scheduledDates: string[] = [];

  for (const dateProfile of dateProfiles) {
    const scheduledDate = extractDate(dateProfile.scheduleDate);

    // Collect matchUps for this date based on profile round ordering
    const { dateMatchUps, dateCourtIds } = collectVenuePlan(
      dateProfile,
      courtsByVenue,
      courtIdsFilter,
      allMatchUps ?? [],
      containedStructureIds,
      scheduleCompletedMatchUps,
    );

    if (!dateMatchUps.length) continue;
    // When the caller has explicitly filtered courts and nothing remains for
    // this date's venues, skip — falling back to "all courts" would defeat
    // the filter.
    if (courtIdsFilter && !dateCourtIds.length) continue;

    // Run proAutoSchedule for this date with the collected matchUps.
    // BYE / completed filtering already happened in `findRoundMatchUps` above
    // when `scheduleCompletedMatchUps` was false (the default), so the
    // scheduler is fed the pre-filtered set.
    const gridResult: any = proAutoSchedule({
      courtIds: resolveTargetCourtIds(dateCourtIds, courtIdsFilter),
      matchUpDailyLimits,
      minCourtGridRows,
      tournamentRecords,
      matchUps: dateMatchUps,
      scheduledDate,
    });

    if (gridResult.error) continue;

    const dateScheduledIds = (gridResult.scheduled ?? []).map((m) => m.matchUpId);
    const dateNotScheduledIds = (gridResult.notScheduled ?? []).map((m) => m.matchUpId);
    const dateOverLimitIds: string[] = gridResult.overLimitMatchUpIds ?? [];

    if (dateScheduledIds.length) {
      scheduledMatchUpIds[scheduledDate] = dateScheduledIds;
      scheduledDates.push(scheduledDate);
    }
    if (dateNotScheduledIds.length) {
      notScheduledMatchUpIds[scheduledDate] = dateNotScheduledIds;
    }
    if (dateOverLimitIds.length) {
      overLimitMatchUpIds[scheduledDate] = dateOverLimitIds;
    }
  }

  return {
    ...SUCCESS,
    scheduledMatchUpIds,
    notScheduledMatchUpIds,
    overLimitMatchUpIds,
    scheduledDates,
  };
}
