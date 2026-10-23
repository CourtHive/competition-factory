import { checkDailyLimits, DailyLimitOverrides } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDailyLimits';
import { getParticipantReachability } from '@Mutate/matchUps/schedule/scheduleMatchUps/getParticipantReachability';
import { modifyParticipantDayMatchUps } from '@Mutate/matchUps/schedule/scheduleMatchUps/participantDayLoad';
import { getParticipantClashes } from '@Mutate/matchUps/schedule/scheduleMatchUps/participantClashes';
import { competitionScheduleMatchUps } from '@Query/matchUps/competitionScheduleMatchUps';
import { matchUpChronologicalSort } from '@Functions/sorters/matchUpChronologicalSort';
import { bulkScheduleMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleMatchUps';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { getGridBookings } from '@Query/venues/getGridBookings';
import { validMatchUps } from '@Validators/validMatchUp';
import { isObject } from '@Tools/objects';

// constants and types
import { INVALID_VALUES, MISSING_CONTEXT } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';

// NOTE: matchUps are assumed to be { inContext: true, nextMatchUps: true }

type ProAutoScheduleArgs = {
  tournamentRecords: { [key: string]: Tournament };
  matchUpDailyLimits?: { [key: string]: number };
  dailyLimitOverrides?: DailyLimitOverrides;
  /** the limits are asked but not enforced: a placement over one is made and reported in dailyLimitWarningMatchUpIds */
  dailyLimitsWarnOnly?: boolean;
  /**
   * @deprecated ignored: completed matchUps are never scheduled (CA 2026-10-23); the write skips one and it is reported
   * not scheduled. Removed at the next major.
   */
  scheduleCompletedMatchUps?: boolean;
  matchUps: HydratedMatchUp[];
  minCourtGridRows?: number;
  scheduledDate: string;
  courtIds?: string[];
};
/** 'HH:MM' or an ISO datetime to minutes-since-midnight; undefined when unreadable. */
function timeToMinutes(value?: string): number | undefined {
  if (typeof value !== 'string' || !value) return undefined;
  const time = value.includes('T') ? value.split('T')[1] : value;
  const [hours, minutes] = time.split(':').map(Number);
  if (!Number.isFinite(hours) || !Number.isFinite(minutes)) return undefined;
  return hours * 60 + minutes;
}

type ClosureWindow = { start: number; end: number };

/**
 * Courts closed for part of the day, keyed by courtId (punch list P33).
 *
 * `getGridBookings` splits a court's bookings into those keyed by `courtOrder` — a cell blocked by
 * hand, already honoured through `isBlocked` — and those carrying only `startTime`/`endTime`. Only
 * the first kind ever became a blocked cell, so a court closed for maintenance still took matchUps.
 * TMX's own court-block UI writes the second kind, so this reached production, not just fixtures.
 */
function buildCourtClosures({ tournamentRecords, scheduledDate }): Record<string, ClosureWindow[]> {
  const closures: Record<string, ClosureWindow[]> = {};
  for (const court of getVenuesAndCourts({ tournamentRecords }).courts ?? []) {
    const { timeBookings } = getGridBookings({ court, date: scheduledDate });
    const windows: ClosureWindow[] = [];
    for (const booking of timeBookings) {
      const start = timeToMinutes(booking.startTime);
      const end = timeToMinutes(booking.endTime);
      if (start !== undefined && end !== undefined) windows.push({ start, end });
    }
    if (windows.length) closures[court.courtId] = windows;
  }
  return closures;
}

/**
 * Whether a closure covers this matchUp's start.
 *
 * Scoped to matchUps that carry a `scheduledTime`: a pure order-based grid row has no clock time to
 * overlap with, so a time window says nothing about it. Untimed matchUps pass through rather than
 * having a time invented for them.
 */
function isClosedAt(windows: ClosureWindow[] | undefined, scheduledTime?: string): boolean {
  if (!windows?.length) return false;
  const startsAt = timeToMinutes(scheduledTime);
  if (startsAt === undefined) return false;
  return windows.some((window) => startsAt >= window.start && startsAt < window.end);
}

/**
 * Index of the first court open at this matchUp's time, or -1 when every remaining court on the row
 * is closed then. Non-mutating: the court is removed only once placement is agreed, so a matchUp
 * that is deferred for some other reason does not consume a court.
 *
 * With no closures anywhere this is index 0 — the plain `shift()` the scheduler always did.
 */
function findOpenCourtIndex(
  availableCourts: any[],
  matchUp: HydratedMatchUp | undefined,
  hasClosures: boolean,
  courtClosures: Record<string, ClosureWindow[]>,
): number {
  if (!hasClosures) return 0;
  const scheduledTime = matchUp?.schedule?.scheduledTime;
  return availableCourts.findIndex((court: any) => !isClosedAt(courtClosures[court?.schedule?.courtId], scheduledTime));
}

export function proAutoSchedule({
  dailyLimitsWarnOnly,
  dailyLimitOverrides,
  matchUpDailyLimits,
  minCourtGridRows = 10,
  tournamentRecords,
  scheduledDate,
  courtIds,
  matchUps,
}: ProAutoScheduleArgs): ResultType & {
  notScheduled?: HydratedMatchUp[];
  scheduled?: HydratedMatchUp[];
  dailyLimitWarningMatchUpIds?: string[];
  overLimitMatchUpIds?: string[];
} {
  if (!validMatchUps(matchUps)) return { error: INVALID_VALUES };
  if (matchUps.some(({ hasContext }) => !hasContext)) {
    return {
      info: 'matchUps must have { inContext: true, nextMatchUps: true }',
      error: MISSING_CONTEXT,
    };
  }

  const matchUpFilters = { localPerspective: true, scheduledDate };
  let result = competitionScheduleMatchUps({
    courtCompletedMatchUps: true,
    withCourtGridRows: true,
    minCourtGridRows,
    tournamentRecords,
    matchUpFilters,
  });
  if (result.error) return result;
  const { rows } = result;

  const gridMatchUps: HydratedMatchUp[] = [];

  const gridRows = rows?.reduce((gridRows, row) => {
    const matchUpIds: string[] = [];
    Object.values(row).forEach((c: any) => {
      if (isObject(c) && c.matchUpId) {
        matchUpIds.push(c.matchUpId);
        gridMatchUps.push(c);
      }
    });
    const availableCourts = Object.values(row).filter(
      (c: any) =>
        isObject(c) && !c.matchUpId && !c.isBlocked && (!courtIds?.length || courtIds.includes(c.schedule?.courtId)),
    );
    return gridRows.concat({
      matchUpIds,
      availableCourts,
      rowId: row.rowId,
    });
  }, []);

  // When Garman has already set scheduledTime on matchUps (Garman → Pro
  // workflow), walk earlier times first so they land on earlier rows.
  // The comparator is a no-op when either side lacks date/time, so a
  // stable sort preserves input order for fresh runs (proConflicts
  // fixtures). BYE / completed filtering happens upstream in
  // `findRoundMatchUps` for the production path; direct callers (tests)
  // pass raw matchUps through.
  matchUps.sort(matchUpChronologicalSort);

  const deps = getMatchUpDependencies({
    matchUps: matchUps.concat(gridMatchUps),
    includeParticipantDependencies: true,
    tournamentRecords,
  }).matchUpDependencies;

  // Per-participant day loads. Only used when matchUpDailyLimits is provided. Pre-populated from gridMatchUps
  // (matchUps already on the grid for this date) so the limit reflects the whole day, not just what this run places.
  // Participants certain and potential for each matchUp come from the reachability model (see participantDayLoad).
  const enforceLimits = hasEntries(matchUpDailyLimits) || hasEntries(dailyLimitOverrides);
  const reachability = getParticipantReachability({
    matchUpDependencies: deps,
    matchUps: matchUps.concat(gridMatchUps),
  });
  const drawIds = new Map(matchUps.concat(gridMatchUps).map(({ matchUpId, drawId }) => [matchUpId, drawId]));
  const drawIdOf = (matchUpId: string) => drawIds.get(matchUpId);
  const individualParticipantProfiles: any = {};
  const overLimitMatchUpIds: string[] = [];
  const dailyLimitWarningMatchUpIds: string[] = [];

  if (enforceLimits) {
    for (const matchUp of gridMatchUps) {
      modifyParticipantDayMatchUps({ individualParticipantProfiles, reachability, matchUp, value: 1 });
    }
  }

  // Courts closed for part of the day (punch list P33). See `buildCourtClosures`.
  const courtClosures = buildCourtClosures({ tournamentRecords, scheduledDate });
  const hasClosures = Object.keys(courtClosures).length > 0;
  const scheduled: HydratedMatchUp[] = [];
  const previousRowMatchUpIds: string[] = [];

  while (matchUps.length && gridRows.length) {
    const row = gridRows.shift();
    const unscheduledMatchUps: HydratedMatchUp[] = [];
    while (matchUps.length && row.availableCourts.length) {
      const unscheduledMatchUpIds = matchUps.concat(unscheduledMatchUps).map((m) => m.matchUpId);
      const matchUp = matchUps.shift();
      // A court closed at this matchUp's time is not a candidate. -1 means every remaining court on
      // the row is closed then, which falls through to the ordinary deferral below.
      const openCourtIndex = findOpenCourtIndex(row.availableCourts, matchUp, hasClosures, courtClosures);
      const verdict = evaluatePlacement({
        matchUp,
        row,
        deps,
        previousRowMatchUpIds,
        unscheduledMatchUpIds,
        enforceLimits,
        drawIdOf,
        matchUpDailyLimits,
        dailyLimitOverrides,
        dailyLimitsWarnOnly,
        individualParticipantProfiles,
        reachability,
      });

      if (verdict.canPlace && matchUp && openCourtIndex !== -1) {
        const court = row.availableCourts.splice(openCourtIndex, 1)[0];
        matchUp.schedule ??= {};
        Object.assign(matchUp.schedule, court.schedule);
        Object.assign(court, matchUp);
        scheduled.push(matchUp);
        if (verdict.atLimit) dailyLimitWarningMatchUpIds.push(matchUp.matchUpId);
        if (enforceLimits) {
          modifyParticipantDayMatchUps({ individualParticipantProfiles, reachability, matchUp, value: 1 });
        }
        row.matchUpIds.push(matchUp.matchUpId);
      } else if (matchUp && verdict.atLimit && !dailyLimitsWarnOnly) {
        if (!overLimitMatchUpIds.includes(matchUp.matchUpId)) overLimitMatchUpIds.push(matchUp.matchUpId);
      } else if (matchUp) {
        unscheduledMatchUps.push(matchUp);
      }
    }
    matchUps.push(...unscheduledMatchUps);
    previousRowMatchUpIds.push(...row.matchUpIds);
  }

  const matchUpDetails = scheduled.map(({ matchUpId, tournamentId, schedule, drawId }) => ({
    tournamentId,
    matchUpId,
    drawId,
    schedule: {
      ...schedule,
      scheduledDate,
    },
  }));

  const writeResult = bulkScheduleMatchUps({ tournamentRecords, matchUpDetails });

  // scheduled is what the write wrote: a matchUp it skipped (completed, a BYE), kept (locked) or could not find was
  // placed on the grid and not written, and was reported scheduled all the same (C4, SCHEDULING_PIPELINE_VNEXT.md § 5)
  const {
    skippedMatchUpIds = [],
    lockedMatchUpIds = [],
    notFoundMatchUpIds = [],
  } = writeResult as {
    notFoundMatchUpIds?: string[];
    skippedMatchUpIds?: string[];
    lockedMatchUpIds?: string[];
  };
  const unwritten = new Set([...skippedMatchUpIds, ...lockedMatchUpIds, ...notFoundMatchUpIds]);
  const written = scheduled.filter(({ matchUpId }) => !unwritten.has(matchUpId));
  const notScheduled = [...matchUps, ...scheduled.filter(({ matchUpId }) => unwritten.has(matchUpId))];

  // a warning is reported only for a placement the write made
  const warned = dailyLimitWarningMatchUpIds.filter((matchUpId) => !unwritten.has(matchUpId));
  return {
    ...writeResult,
    dailyLimitWarningMatchUpIds: warned,
    scheduled: written,
    overLimitMatchUpIds,
    notScheduled,
  };
}

const hasEntries = (value?: object) => !!value && Object.keys(value).length > 0;

// Evaluate whether `matchUp` can be placed on `row` given dependency,
// participant-conflict, and (optional) daily-limit constraints. Returns a
// discriminated verdict: `canPlace` (with side-effect inputs prepared),
// `atLimit` (over the daily limit — should NOT be retried), or neither
// (defer to a later row). With `dailyLimitsWarnOnly` a matchUp over a limit
// can still be placed, `atLimit` then marking the placement for a warning.
function evaluatePlacement({
  matchUp,
  row,
  deps,
  previousRowMatchUpIds,
  unscheduledMatchUpIds,
  enforceLimits,
  drawIdOf,
  matchUpDailyLimits,
  dailyLimitOverrides,
  dailyLimitsWarnOnly,
  individualParticipantProfiles,
  reachability,
}: any): { canPlace: boolean; atLimit: boolean } {
  if (!matchUp) return { canPlace: false, atLimit: false };

  const matchUpId = matchUp.matchUpId;
  const linkedMatchUpIds = deps[matchUpId].matchUpIds.concat(deps[matchUpId].dependentMatchUpIds);

  const unscheduledContainSource = unscheduledMatchUpIds.some((id: string) => deps[matchUpId].matchUpIds.includes(id));
  const previousIncludesDependent = previousRowMatchUpIds.some((id: string) =>
    deps[matchUpId].dependentMatchUpIds.includes(id),
  );
  const rowIncludesLinked = row.matchUpIds.some((id: string) => linkedMatchUpIds.includes(id));

  // a participant who can play this matchUp and one already on the row clashes, unless the two are alternatives for
  // them (a feeder's winner path and loser path; see getParticipantClashes)
  const rowContainsParticipants =
    getParticipantClashes({ matchUpIds: [matchUpId], otherMatchUpIds: row.matchUpIds, reachability, drawIdOf })
      .clashingMatchUpIds.length > 0;

  let atLimitParticipantIds: string[] = [];
  if (enforceLimits) {
    const dlResult = checkDailyLimits({
      reachability,
      individualParticipantProfiles,
      dailyLimitOverrides,
      matchUpDailyLimits,
      matchUp,
    });
    atLimitParticipantIds = dlResult.participantIdsAtLimit;
  }

  const atLimit = atLimitParticipantIds.length > 0;
  const canPlace =
    !rowIncludesLinked &&
    !unscheduledContainSource &&
    !rowContainsParticipants &&
    !previousIncludesDependent &&
    (!atLimit || !!dailyLimitsWarnOnly);

  return { canPlace, atLimit };
}
