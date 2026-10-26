import { getParticipantReachability, ParticipantReachability } from '../scheduleMatchUps/getParticipantReachability';
import { checkDailyLimits, DailyLimitOverrides } from '../scheduleMatchUps/checkDailyLimits';
import { getSchedulingMatchUps } from '@Query/matchUps/scheduling/getSchedulingMatchUps';
import { matchUpChronologicalSort } from '@Functions/sorters/matchUpChronologicalSort';
import { modifyParticipantDayMatchUps } from '../scheduleMatchUps/participantDayLoad';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { getParticipantClashes } from '../scheduleMatchUps/participantClashes';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { getGridBookings } from '@Query/venues/getGridBookings';
import { isObject } from '@Tools/objects';
import { dateGridRows } from './gridRows';

// constants and types
import type { IndividualParticipantProfiles } from '../scheduleMatchUps/checkParticipantProfileInitialization';
import type { ErrorType } from '@Constants/errorConditionConstants';
import type { Tournament } from '@Types/tournamentTypes';
import type { HydratedMatchUp } from '@Types/hydrated';

/**
 * The grid pipeline's date, split as the timed pipeline is (scheduling-pipeline.md § 5): the VIEW a date is planned
 * from, read once from the records as the dates before it left them; the PLAN, a function of the view alone; and the
 * write, which stays `bulkScheduleMatchUps`. A date's plan reads no record, so it can be planned from a literal.
 */

/** of the dependency graph, what the plan reads: each matchUp's sources and the matchUps that depend on it */
export type GridDependencies = { [matchUpId: string]: { matchUpIds: string[]; dependentMatchUpIds: string[] } };

/** a court cell of the date's grid: free unless a matchUp is on it or it is blocked */
export type GridCell = { schedule?: { courtId?: string; [key: string]: unknown }; [key: string]: unknown };

/** a row of the date's grid: the matchUps already on it, and its cells still free on the call's courts */
export type GridRow = { rowId?: string; matchUpIds: string[]; availableCourts: GridCell[] };

/** a time window a court is closed in, minutes past midnight */
export type ClosureWindow = { start: number; end: number };

export type GridDateView = {
  scheduledDate: string;
  /** the matchUps to place, earlier times first (a stable sort: untimed matchUps keep the profile's order) */
  matchUps: HydratedMatchUp[];
  /** the matchUps already on the date's grid */
  gridMatchUps: HydratedMatchUp[];
  gridRows: GridRow[];
  matchUpDependencies: GridDependencies;
  reachability: ParticipantReachability;
  /** courts closed for part of the day (punch list P33), by courtId */
  courtClosures: Record<string, ClosureWindow[]>;
  matchUpDailyLimits?: { [key: string]: number };
  dailyLimitOverrides?: DailyLimitOverrides;
  /** the limits are asked but not enforced: a placement over one is made and warned */
  dailyLimitsWarnOnly?: boolean;
};

/** a placement: the matchUp, and the schedule of the cell it takes (its court, venue and court order) */
export type GridPlacement = { matchUpId: string; schedule: Record<string, unknown> };

export type GridDatePlan = {
  /** the placements, in the order made */
  placements: GridPlacement[];
  /** what no row took, in the order last offered */
  notScheduledMatchUpIds: string[];
  overLimitMatchUpIds: string[];
  dailyLimitWarningMatchUpIds: string[];
};

type BuildGridDateViewArgs = {
  tournamentRecords: { [key: string]: Tournament };
  matchUpDailyLimits?: { [key: string]: number };
  dailyLimitOverrides?: DailyLimitOverrides;
  dailyLimitsWarnOnly?: boolean;
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

/**
 * Courts closed for part of the day, keyed by courtId (punch list P33).
 *
 * `getGridBookings` splits a court's bookings into those keyed by `courtOrder` — a cell blocked by
 * hand, already honoured through `isBlocked` — and those carrying only `startTime`/`endTime`. Only
 * the first kind ever became a blocked cell, so a court closed for maintenance still took matchUps.
 * TMX's own court-block UI writes the second kind, so this reached production, not just fixtures.
 */
type CourtClosuresArgs = { tournamentRecords: { [key: string]: Tournament }; scheduledDate: string };
function buildCourtClosures({ tournamentRecords, scheduledDate }: CourtClosuresArgs): Record<string, ClosureWindow[]> {
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
 * The date's view: its grid (the cells already taken and those free on the call's courts), the matchUps to place in
 * chronological order, the dependency graph and the reachability over them and the matchUps already on the grid, the
 * courts' closures, and the limits. NOTE: matchUps are assumed to be { inContext: true, nextMatchUps: true }.
 */
export function buildGridDateView({
  dailyLimitsWarnOnly,
  dailyLimitOverrides,
  matchUpDailyLimits,
  minCourtGridRows = 10,
  tournamentRecords,
  scheduledDate,
  courtIds,
  matchUps,
}: BuildGridDateViewArgs): GridDateView | { error: ErrorType } {
  // the competition as the records stand for this date (the dates before it written), projected, not hydrated
  const competitionMatchUps = getSchedulingMatchUps({ tournamentRecords });
  const result = dateGridRows({ matchUps: competitionMatchUps, tournamentRecords, minCourtGridRows, scheduledDate });
  if (result.error) return { error: result.error };

  const gridMatchUps: HydratedMatchUp[] = [];
  const gridRows: GridRow[] = (result.rows ?? []).map((row: Record<string, unknown>) => {
    const matchUpIds: string[] = [];
    const cells = Object.values(row).filter((cell): cell is GridCell => isObject(cell));
    for (const cell of cells) {
      if (typeof cell.matchUpId !== 'string' || !cell.matchUpId) continue;
      matchUpIds.push(cell.matchUpId);
      gridMatchUps.push(cell as unknown as HydratedMatchUp);
    }
    const availableCourts = cells.filter(
      (cell) =>
        !cell.matchUpId &&
        !cell.isBlocked &&
        (!courtIds?.length || courtIds.includes(cell.schedule?.courtId as string)),
    );
    return { matchUpIds, availableCourts, rowId: row.rowId as string | undefined };
  });

  // When Garman has already set scheduledTime on matchUps (Garman → Pro workflow), walk earlier times first so they
  // land on earlier rows. The comparator is a no-op when either side lacks date/time, so a stable sort preserves input
  // order for fresh runs. The caller's array is left as it was.
  const ordered = [...matchUps].sort(matchUpChronologicalSort);

  const matchUpDependencies: GridDependencies = getMatchUpDependencies({
    matchUps: ordered.concat(gridMatchUps),
    includeParticipantDependencies: true,
    competitionMatchUps,
    tournamentRecords,
  }).matchUpDependencies;

  // Participants certain and potential for each matchUp come from the reachability model (see participantDayLoad).
  const reachability = getParticipantReachability({
    matchUps: ordered.concat(gridMatchUps),
    matchUpDependencies,
  });

  return {
    courtClosures: buildCourtClosures({ tournamentRecords, scheduledDate }),
    dailyLimitsWarnOnly,
    dailyLimitOverrides,
    matchUpDailyLimits,
    matchUpDependencies,
    matchUps: ordered,
    scheduledDate,
    gridMatchUps,
    reachability,
    gridRows,
  };
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
  availableCourts: GridCell[],
  matchUp: HydratedMatchUp | undefined,
  hasClosures: boolean,
  courtClosures: Record<string, ClosureWindow[]>,
): number {
  if (!hasClosures) return 0;
  const scheduledTime = matchUp?.schedule?.scheduledTime;
  return availableCourts.findIndex(
    (court) => !isClosedAt(courtClosures[court?.schedule?.courtId as string], scheduledTime),
  );
}

const hasEntries = (value?: object) => !!value && Object.keys(value).length > 0;

/**
 * The date's plan (§ 5): row by row, each remaining matchUp on the row's first open court unless a matchUp it is
 * linked to is on the row, a source is still unplaced, a dependent is on the previous row, a participant who can play
 * it is on the row (unless the two are alternatives for them), or a participant would go over a daily limit (placed
 * and warned when the limits only warn). A matchUp not placed on a row is offered to the next. The view is not changed.
 */
export function planGridDate(view: GridDateView): GridDatePlan {
  const {
    dailyLimitsWarnOnly,
    dailyLimitOverrides,
    matchUpDailyLimits,
    matchUpDependencies: deps,
    courtClosures,
    reachability,
  } = view;
  // the plan takes and consumes its own copies: the view stays as it was
  const matchUps: HydratedMatchUp[] = structuredClone(view.matchUps);
  const gridRows: GridRow[] = structuredClone(view.gridRows);
  const gridMatchUps = view.gridMatchUps;

  const drawIds = new Map(matchUps.concat(gridMatchUps).map(({ matchUpId, drawId }) => [matchUpId, drawId]));
  const drawIdOf = (matchUpId: string) => drawIds.get(matchUpId);
  const enforceLimits = hasEntries(matchUpDailyLimits) || hasEntries(dailyLimitOverrides);
  // Per-participant day loads, pre-populated from the matchUps already on the date's grid, so the limit reflects the
  // whole day, not just what this run places.
  const individualParticipantProfiles: IndividualParticipantProfiles = {};
  if (enforceLimits) {
    for (const matchUp of gridMatchUps) {
      modifyParticipantDayMatchUps({ individualParticipantProfiles, reachability, matchUp, value: 1 });
    }
  }

  const hasClosures = Object.keys(courtClosures).length > 0;
  const overLimitMatchUpIds: string[] = [];
  const dailyLimitWarningMatchUpIds: string[] = [];
  const placements: GridPlacement[] = [];
  const previousRowMatchUpIds: string[] = [];

  while (matchUps.length && gridRows.length) {
    const row = gridRows.shift() as GridRow;
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
        placements.push({ matchUpId: matchUp.matchUpId, schedule: { ...court.schedule } });
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

  return {
    notScheduledMatchUpIds: matchUps.map(({ matchUpId }) => matchUpId),
    dailyLimitWarningMatchUpIds,
    overLimitMatchUpIds,
    placements,
  };
}

// Evaluate whether `matchUp` can be placed on `row` given dependency,
// participant-conflict, and (optional) daily-limit constraints. Returns a
// discriminated verdict: `canPlace` (with side-effect inputs prepared),
// `atLimit` (over the daily limit — should NOT be retried), or neither
// (defer to a later row). With `dailyLimitsWarnOnly` a matchUp over a limit
// can still be placed, `atLimit` then marking the placement for a warning.
type EvaluatePlacementArgs = {
  matchUp?: HydratedMatchUp;
  row: GridRow;
  deps: GridDependencies;
  previousRowMatchUpIds: string[];
  unscheduledMatchUpIds: string[];
  enforceLimits: boolean;
  drawIdOf: (matchUpId: string) => string | undefined;
  matchUpDailyLimits?: { [key: string]: number };
  dailyLimitOverrides?: DailyLimitOverrides;
  dailyLimitsWarnOnly?: boolean;
  individualParticipantProfiles: IndividualParticipantProfiles;
  reachability: ParticipantReachability;
};
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
}: EvaluatePlacementArgs): { canPlace: boolean; atLimit: boolean } {
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
