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
import { NO_VALID_DATES } from '@Constants/errorConditionConstants';
import { DOUBLES, SINGLES } from '@Constants/matchUpTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { BYE } from '@Constants/matchUpStatusConstants';

type ScheduleProfileGridArgs = {
  tournamentRecords: TournamentRecords;
  scheduleCompletedMatchUps?: boolean;
  clearScheduleDates?: boolean;
  minCourtGridRows?: number;
  scheduleDates?: string[];
};

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
    minCourtGridRows = 10,
    clearScheduleDates,
    scheduleDates = [],
    tournamentRecords,
  } = params;

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
  const scheduledDates: string[] = [];

  for (const dateProfile of dateProfiles) {
    const scheduledDate = extractDate(dateProfile.scheduleDate);

    // Collect matchUps for this date based on profile round ordering
    const dateMatchUps: any[] = [];
    const dateCourtIds: string[] = [];

    for (const venueProfile of dateProfile.venues ?? []) {
      const venueCourtIds = courtsByVenue.get(venueProfile.venueId) ?? [];
      dateCourtIds.push(...venueCourtIds);

      for (const roundProfile of venueProfile.rounds ?? []) {
        const { structureId, roundNumber, drawId, roundSegment } = roundProfile;

        // Resolve the effective structureId (handle round robin container)
        const effectiveStructureId = containedStructureIds[structureId] ?? structureId;

        // Find matching unscheduled matchUps
        const roundMatchUps = (allMatchUps ?? []).filter((m: any) => {
          if (m.matchUpStatus === BYE) return false;
          if (m.schedule?.courtId) return false; // already has a court assignment
          if (m.schedule?.courtOrder) return false; // already grid-positioned

          const mStructureId = containedStructureIds[m.structureId] ?? m.structureId;
          if (mStructureId !== effectiveStructureId) return false;
          if (m.roundNumber !== roundNumber) return false;
          if (m.drawId !== drawId) return false;

          // Handle round segments
          if (roundSegment) {
            const segmentsCount = roundSegment.segmentsCount;
            const segmentNumber = roundSegment.segmentNumber;
            const chunkSize = Math.ceil(
              (allMatchUps ?? []).filter(
                (rm: any) => rm.structureId === m.structureId && rm.roundNumber === roundNumber && rm.drawId === drawId,
              ).length / segmentsCount,
            );
            const sortedPositions = (allMatchUps ?? [])
              .filter(
                (rm: any) => rm.structureId === m.structureId && rm.roundNumber === roundNumber && rm.drawId === drawId,
              )
              .sort((a: any, b: any) => (a.roundPosition ?? 0) - (b.roundPosition ?? 0))
              .map((rm: any) => rm.matchUpId);
            const segStart = (segmentNumber - 1) * chunkSize;
            const segEnd = segStart + chunkSize;
            const segmentIds = sortedPositions.slice(segStart, segEnd);
            return segmentIds.includes(m.matchUpId);
          }

          return true;
        });

        dateMatchUps.push(...roundMatchUps);
      }
    }

    if (!dateMatchUps.length) continue;

    // Run proAutoSchedule for this date with the collected matchUps
    const gridResult: any = proAutoSchedule({
      courtIds: dateCourtIds.length ? dateCourtIds : undefined,
      scheduleCompletedMatchUps,
      minCourtGridRows,
      tournamentRecords,
      matchUps: dateMatchUps,
      scheduledDate,
    });

    if (gridResult.error) continue;

    const dateScheduledIds = (gridResult.scheduled ?? []).map((m) => m.matchUpId);
    const dateNotScheduledIds = (gridResult.notScheduled ?? []).map((m) => m.matchUpId);

    if (dateScheduledIds.length) {
      scheduledMatchUpIds[scheduledDate] = dateScheduledIds;
      scheduledDates.push(scheduledDate);
    }
    if (dateNotScheduledIds.length) {
      notScheduledMatchUpIds[scheduledDate] = dateNotScheduledIds;
    }
  }

  return {
    ...SUCCESS,
    scheduledMatchUpIds,
    notScheduledMatchUpIds,
    scheduledDates,
  };
}
