import { overnightRestWarningsFor } from '@Query/matchUps/scheduling/getOvernightRestWarnings';
import { buildGridDateView, planGridDate } from '@Mutate/matchUps/schedule/pipeline/gridPlan';
import { bulkScheduleMatchUps } from '@Mutate/matchUps/schedule/bulkScheduleMatchUps';
import { eventDateResolver, EventDateReason } from '@Query/events/eventPlaysOnDate';
import { extractDate } from '@Tools/dateTime';
import { validMatchUps } from '@Validators/validMatchUp';

// constants and types
import type { DailyLimitOverrides } from '@Mutate/matchUps/schedule/scheduleMatchUps/checkDailyLimits';
import type { OvernightRestWarning } from '@Query/matchUps/scheduling/getOvernightRestWarnings';
import { INVALID_VALUES, MISSING_CONTEXT } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import { ResultType } from '@Types/factoryTypes';

// NOTE: matchUps are assumed to be { inContext: true, nextMatchUps: true }

type ProAutoScheduleArgs = {
  tournamentRecords: { [key: string]: Tournament };
  /** place matchUps on a date their event does not play, and warn (EVENT_DATE_INACTIVE), rather than skip them */
  allowInactiveEventDates?: boolean;
  matchUpDailyLimits?: { [key: string]: number };
  dailyLimitOverrides?: DailyLimitOverrides;
  /** the limits are asked but not enforced: a placement over one is made and reported in dailyLimitWarningMatchUpIds */
  dailyLimitsWarnOnly?: boolean;
  /** false: the caller reports overnight rest itself, once for all its dates (the grid) */
  overnightRestWarnings?: boolean;
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
/** overnight rest is warned, not held (§ 9.8): measured for a placement with a time (a court order alone has none) */
type OvernightRestOfArgs = {
  tournamentRecords: { [key: string]: Tournament };
  warnOvernightRest: boolean;
  scheduledDate: string;
};
function overnightRestOf({ warnOvernightRest, scheduledDate, tournamentRecords }: OvernightRestOfArgs) {
  return warnOvernightRest
    ? overnightRestWarningsFor({ scheduleDates: [scheduledDate], tournamentRecords })
    : undefined;
}

export function proAutoSchedule({
  allowInactiveEventDates = false,
  dailyLimitsWarnOnly,
  dailyLimitOverrides,
  matchUpDailyLimits,
  overnightRestWarnings: warnOvernightRest = true,
  minCourtGridRows = 10,
  tournamentRecords,
  scheduledDate,
  courtIds,
  matchUps,
}: ProAutoScheduleArgs): ResultType & {
  notScheduled?: HydratedMatchUp[];
  scheduled?: HydratedMatchUp[];
  dailyLimitWarningMatchUpIds?: string[];
  overnightRestWarnings?: { [scheduleDate: string]: OvernightRestWarning[] };
  overLimitMatchUpIds?: string[];
  eventDateSkippedMatchUpIds?: {
    [scheduleDate: string]: { matchUpId: string; eventId: string; reason: EventDateReason }[];
  };
} {
  if (!validMatchUps(matchUps)) return { error: INVALID_VALUES };
  if (matchUps.some(({ hasContext }) => !hasContext)) {
    return {
      info: 'matchUps must have { inContext: true, nextMatchUps: true }',
      error: MISSING_CONTEXT,
    };
  }

  // a matchUp whose event does not play on the date is not placed: it is reported not scheduled, and why
  const { playing, skipped, skips } = eventDateFilter({
    allowInactiveEventDates,
    tournamentRecords,
    scheduledDate,
    matchUps,
  });
  matchUps = playing;

  // the date's view, then its plan, which reads no record (pipeline/gridPlan.ts), then the write
  const view = buildGridDateView({
    dailyLimitsWarnOnly,
    dailyLimitOverrides,
    matchUpDailyLimits,
    tournamentRecords,
    minCourtGridRows,
    scheduledDate,
    courtIds,
    matchUps,
  });
  if ('error' in view) return { error: view.error };
  const plan = planGridDate(view);
  const { overLimitMatchUpIds, dailyLimitWarningMatchUpIds } = plan;

  // each placement's cell is merged into the caller's matchUp, as it always was: the write reads that schedule, and a
  // caller placing several dates from one hydration sees a matchUp already placed on a court
  const callerMatchUps = new Map(matchUps.map((matchUp) => [matchUp.matchUpId, matchUp]));
  const scheduled: HydratedMatchUp[] = [];
  for (const { matchUpId, schedule } of plan.placements) {
    const matchUp = callerMatchUps.get(matchUpId);
    if (!matchUp) continue;
    matchUp.schedule ??= {};
    Object.assign(matchUp.schedule, schedule);
    scheduled.push(matchUp);
  }
  const unplaced = plan.notScheduledMatchUpIds.flatMap((matchUpId) => callerMatchUps.get(matchUpId) ?? []);

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
  const notScheduled = [...unplaced, ...scheduled.filter(({ matchUpId }) => unwritten.has(matchUpId)), ...skipped];

  // a warning is reported only for a placement the write made
  const warned = dailyLimitWarningMatchUpIds.filter((matchUpId) => !unwritten.has(matchUpId));
  const overnightRestWarnings = overnightRestOf({ warnOvernightRest, scheduledDate, tournamentRecords });
  return {
    ...writeResult,
    dailyLimitWarningMatchUpIds: warned,
    overnightRestWarnings,
    scheduled: written,
    overLimitMatchUpIds,
    notScheduled,
    ...(skips.length ? { eventDateSkippedMatchUpIds: { [extractDate(scheduledDate)]: skips } } : {}),
  };
}

type EventDateFilterArgs = {
  tournamentRecords: { [key: string]: Tournament };
  allowInactiveEventDates: boolean;
  matchUps: HydratedMatchUp[];
  scheduledDate: string;
};

/** the matchUps whose event plays on the date, and those it does not, with why (eventPlaysOnDate) */
function eventDateFilter({ allowInactiveEventDates, tournamentRecords, scheduledDate, matchUps }: EventDateFilterArgs) {
  const skips: { matchUpId: string; eventId: string; reason: EventDateReason }[] = [];
  const skipped: HydratedMatchUp[] = [];
  if (allowInactiveEventDates) return { playing: matchUps, skipped, skips };
  const resolve = eventDateResolver(tournamentRecords);
  const date = extractDate(scheduledDate);
  const playing = matchUps.filter((matchUp) => {
    const { matchUpId, eventId, tournamentId } = matchUp;
    const verdict = resolve({ tournamentId, eventId, date });
    if (verdict.plays) return true;
    skips.push({ matchUpId, eventId, reason: verdict.reason });
    skipped.push(matchUp);
    return false;
  });
  return { playing, skipped, skips };
}
