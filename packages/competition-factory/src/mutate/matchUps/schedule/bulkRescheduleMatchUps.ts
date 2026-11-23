import { addMatchUpScheduleItems } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getTournamentInfo } from '@Query/tournaments/getTournamentInfo';
import { checkBatchPlayedOrder } from './scheduleItems/playedOrder';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { getMatchUpIds } from '@Functions/global/extractors';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import {
  addMinutesToTimeString,
  dateStringDaysChange,
  extractDate,
  extractTime,
  timeStringMinutes,
} from '@Tools/dateTime';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { TournamentRecords, ResultType, ResultWarning } from '@Types/factoryTypes';
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  INVALID_VALUES,
  MISSING_MATCHUP_IDS,
  MISSING_TOURNAMENT_RECORD,
  SCHEDULE_LOCKED,
} from '@Constants/errorConditionConstants';

type BulkRescheduleMatchUpsArgs = {
  tournamentRecords: TournamentRecords;
  tournamentRecord: Tournament;
  matchUpIds: string[];
  overrideScheduleLock?: boolean;
  scheduleChange: any;
  dryRun?: boolean;
};
export function bulkRescheduleMatchUps(params: BulkRescheduleMatchUpsArgs): ResultType & {
  lockedMatchUpIds?: string[];
  allRescheduled?: boolean;
  notRescheduled?: HydratedMatchUp[];
  rescheduled?: HydratedMatchUp[];
} {
  const { overrideScheduleLock, scheduleChange, matchUpIds, dryRun } = params;
  if (!matchUpIds || !Array.isArray(matchUpIds)) return { error: MISSING_MATCHUP_IDS };
  if (typeof scheduleChange !== 'object') return { error: INVALID_VALUES };

  const tournamentRecords = resolveTournamentRecords(params);

  const rescheduled: HydratedMatchUp[] = [];
  let notRescheduled: HydratedMatchUp[] = [];
  const lockedMatchUpIds: string[] = [];
  const warnings: ScheduleWarning[] = [];

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = bulkReschedule({
      overrideScheduleLock,
      lockedMatchUpIds,
      warnings,
      tournamentRecords,
      tournamentRecord,
      scheduleChange,
      matchUpIds,
      dryRun,
    });
    if (result.error) return result;

    if (Array.isArray(result.notRescheduled)) notRescheduled.push(...result.notRescheduled);

    // this is a check in case something has been rescheduled multiple times in the same call
    const notRescheduledIds = getMatchUpIds(result.notRescheduled);
    const removeFromNotScheduledIds: string[] = [];
    result.rescheduled?.forEach((matchUp) => {
      const { matchUpId } = matchUp;
      if (notRescheduledIds.includes(matchUpId)) {
        removeFromNotScheduledIds.push(matchUpId);
      }
      rescheduled.push(matchUp);
    });

    // filters what every tournament so far left unrescheduled, not only this tournament's result (B6)
    if (removeFromNotScheduledIds.length) {
      notRescheduled = notRescheduled.filter(({ matchUpId }) => !removeFromNotScheduledIds.includes(matchUpId));
    }
  }

  const allRescheduled = !!(rescheduled.length && !notRescheduled.length);

  return {
    ...SUCCESS,
    rescheduled,
    notRescheduled,
    allRescheduled,
    ...(lockedMatchUpIds.length ? { lockedMatchUpIds } : {}),
    ...(warnings.length ? { warnings } : {}),
  };
}

/** a warning returned by the schedule write, naming the matchUp it was raised for */
type ScheduleWarning = ResultWarning & { matchUpId: string };
/**
 *
 * @param {object} tournamentRecord - passed in automatically by tournamentEngine
 * @param {string[]} matchUpIds - array of matchUpIds to be scheduled
 * @param {object} scheduleChange - { minutesChange, daysChange }
 *
 */

type BulkRescheduleArgs = {
  overrideScheduleLock?: boolean;
  tournamentRecords?: TournamentRecords;
  lockedMatchUpIds?: string[];
  /** collects the warnings of each write, each carrying its matchUpId */
  warnings?: ScheduleWarning[];
  tournamentRecord?: Tournament;
  matchUpIds: string[];
  scheduleChange: BulkRescheduleMatchUpsArgs['scheduleChange'];
  dryRun?: boolean;
};
type BulkRescheduleResult = ResultType & {
  notRescheduled?: HydratedMatchUp[];
  rescheduled?: HydratedMatchUp[];
  allRescheduled?: boolean;
};
export function bulkReschedule({
  lockedMatchUpIds = [],
  warnings = [],
  overrideScheduleLock,
  tournamentRecords,
  tournamentRecord,
  scheduleChange,
  matchUpIds,
  dryRun,
}: BulkRescheduleArgs): BulkRescheduleResult {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!matchUpIds || !Array.isArray(matchUpIds)) return { error: MISSING_MATCHUP_IDS };
  if (typeof scheduleChange !== 'object') return { error: INVALID_VALUES };

  const { minutesChange, daysChange } = scheduleChange;
  if (!minutesChange && !daysChange) return { ...SUCCESS };

  if (minutesChange && isNaN(minutesChange)) return { error: INVALID_VALUES };
  if (daysChange && isNaN(daysChange)) return { error: INVALID_VALUES };

  const scheduledNotCompletedMatchUps = getScheduledNotCompleted({ tournamentRecord, matchUpIds });
  if (!scheduledNotCompletedMatchUps?.length) return { ...SUCCESS };

  const { tournamentInfo } = getTournamentInfo({ tournamentRecord });
  const { startDate, endDate } = tournamentInfo!; // tournamentRecord is required above

  const drawIdMap = groupByDrawId(scheduledNotCompletedMatchUps);

  const rescheduledMatchUpIds: string[] = [];
  const notRescheduledMatchUpIds: string[] = [];

  // a shift that would put a matchUp before a played matchUp it depends on (or a played matchUp after one that depends
  // on it) is refused for the whole batch, judged on where the batch leaves every matchUp, before any is written
  const placements = scheduledNotCompletedMatchUps
    .filter(({ matchUpId }) => matchUpIds.includes(matchUpId))
    .flatMap((inContextMatchUp) => {
      const { dateRefused, timeRefused, newScheduledDate, newScheduledTime } = computeReschedule({
        inContextMatchUp,
        minutesChange,
        daysChange,
        startDate,
        endDate,
      });
      if (dateRefused || timeRefused || (!newScheduledDate && !newScheduledTime)) return [];
      const schedule = {
        ...(newScheduledDate ? { scheduledDate: newScheduledDate } : {}),
        ...(newScheduledTime ? { scheduledTime: newScheduledTime } : {}),
      };
      return [{ drawId: inContextMatchUp.drawId, matchUpId: inContextMatchUp.matchUpId, schedule }];
    });
  const playedOrderRefusal = checkBatchPlayedOrder({ tournamentRecord, placements });
  if (playedOrderRefusal) return playedOrderRefusal;

  for (const drawId of Object.keys(drawIdMap)) {
    const result = findDrawDefinition({ tournamentRecord, drawId });
    if (result.error) return result;
    const drawDefinition = result.drawDefinition;

    const drawMatchUpIds = drawIdMap[drawId].filter((matchUpId) => matchUpIds.includes(matchUpId));

    for (const matchUpId of drawMatchUpIds) {
      if (!matchUpId || !drawDefinition) continue;

      const rescheduleResult = rescheduleMatchUp({
        scheduledNotCompletedMatchUps,
        overrideScheduleLock,
        lockedMatchUpIds,
        warnings,
        rescheduledMatchUpIds,
        notRescheduledMatchUpIds,
        tournamentRecords,
        tournamentRecord,
        drawDefinition,
        minutesChange,
        daysChange,
        startDate,
        matchUpId,
        endDate,
        dryRun,
      });
      if (rescheduleResult?.error) return rescheduleResult;
    }
  }

  const updatedInContext =
    allTournamentMatchUps({
      matchUpFilters: { matchUpIds },
      tournamentRecord,
    }).matchUps ?? [];

  const rescheduled = updatedInContext.filter(({ matchUpId }) => rescheduledMatchUpIds.includes(matchUpId));
  const notRescheduled = updatedInContext.filter(({ matchUpId }) => notRescheduledMatchUpIds.includes(matchUpId));

  const allRescheduled = !!(rescheduled.length && !notRescheduled.length);

  return { ...SUCCESS, rescheduled, notRescheduled, allRescheduled };
}

function getScheduledNotCompleted({ tournamentRecord, matchUpIds }) {
  const { matchUps } = allTournamentMatchUps({
    matchUpFilters: { matchUpIds },
    tournamentRecord,
  });

  const notCompleted = ({ matchUpStatus }) => !completedMatchUpStatuses.includes(matchUpStatus);

  return matchUps
    ?.filter((matchUp) => hasSchedule({ schedule: matchUp.schedule }))
    .filter((matchUp) => notCompleted({ matchUpStatus: matchUp.matchUpStatus }));
}

function groupByDrawId(matchUps) {
  return matchUps.reduce((drawIdMap, matchUp) => {
    const { matchUpId, drawId } = matchUp;
    if (drawIdMap[drawId]) {
      drawIdMap[drawId].push(matchUpId);
    } else {
      drawIdMap[drawId] = [matchUpId];
    }
    return drawIdMap;
  }, {});
}

type RescheduleMatchUpArgs = {
  scheduledNotCompletedMatchUps: HydratedMatchUp[];
  tournamentRecords?: TournamentRecords;
  notRescheduledMatchUpIds: string[];
  overrideScheduleLock?: boolean;
  rescheduledMatchUpIds: string[];
  drawDefinition: DrawDefinition;
  tournamentRecord: Tournament;
  lockedMatchUpIds: string[];
  warnings: ScheduleWarning[];
  minutesChange?: number;
  daysChange?: number;
  startDate?: string;
  matchUpId: string;
  endDate?: string;
  dryRun?: boolean;
};

function rescheduleMatchUp({
  scheduledNotCompletedMatchUps,
  overrideScheduleLock,
  lockedMatchUpIds,
  warnings,
  rescheduledMatchUpIds,
  notRescheduledMatchUpIds,
  tournamentRecords,
  tournamentRecord,
  drawDefinition,
  minutesChange,
  daysChange,
  startDate,
  matchUpId,
  endDate,
  dryRun,
}: RescheduleMatchUpArgs): ResultType | undefined {
  const { dateRefused, timeRefused, newScheduledDate, newScheduledTime } = computeReschedule({
    inContextMatchUp: scheduledNotCompletedMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId),
    minutesChange,
    daysChange,
    startDate,
    endDate,
  });

  if (dateRefused || timeRefused) {
    notRescheduledMatchUpIds.push(matchUpId);
    return undefined;
  }

  if (newScheduledTime || newScheduledDate) {
    // Written through addMatchUpScheduleItems so a re-dated matchUp leaves the old day's grid (B3): its courtOrder,
    // court and venue were a position on THAT day's grid, and a date change clears them exactly as it does for
    // scheduleMatchUps. The tournamentRecord also lets the date's own range check run. Chronology is not checked: a
    // bulk shift moves every listed matchUp together. A schedule lock is respected (B7): the locked matchUp is skipped
    // and reported in lockedMatchUpIds, as every bulk path does, unless the caller passes overrideScheduleLock. A dry
    // run validates without writing, so it reports locks too.
    const result = addMatchUpScheduleItems({
      schedule: {
        ...(newScheduledDate ? { scheduledDate: newScheduledDate } : {}),
        ...(newScheduledTime ? { scheduledTime: newScheduledTime } : {}),
      },
      checkChronology: false,
      playedOrderChecked: true,
      validateOnly: !!dryRun,
      overrideScheduleLock,
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpId,
    });
    if (result.error?.code === SCHEDULE_LOCKED.code) {
      lockedMatchUpIds.push(matchUpId);
      notRescheduledMatchUpIds.push(matchUpId);
      return undefined;
    }
    if (result.error) return result;
    // what the write had to say is passed on, not dropped, each naming its matchUp
    for (const warning of result.warnings ?? []) warnings.push({ ...warning, matchUpId });
  }
  if (newScheduledTime || newScheduledDate) {
    rescheduledMatchUpIds.push(matchUpId);
  }
  return undefined;
}

/** where a shift moves one matchUp, or that it refuses to (each change is its own verdict) */
function computeReschedule({
  inContextMatchUp,
  minutesChange,
  daysChange,
  startDate,
  endDate,
}: {
  inContextMatchUp?: HydratedMatchUp;
  minutesChange?: number;
  daysChange?: number;
  startDate?: string;
  endDate?: string;
}) {
  const dayTotalMinutes = 1440;
  const { scheduledTime, scheduledDate } = inContextMatchUp?.schedule ?? {};

  // Each change is a separate verdict and EITHER refuses the matchUp. B1: the minutes verdict used to
  // overwrite the days verdict, so { daysChange: 1, minutesChange: 30 } on endDate was written to endDate + 1.
  let dateRefused = false;
  let timeRefused = false;
  let newScheduledTime, newScheduledDate;
  if (daysChange && scheduledDate) {
    const currentDate = extractDate(scheduledDate);
    newScheduledDate = dateStringDaysChange(currentDate, daysChange);

    // a tournament without a startDate or endDate bounds nothing on that side
    const beforeStart = !!startDate && new Date(newScheduledDate) < new Date(startDate);
    const afterEnd = !!endDate && new Date(newScheduledDate) > new Date(endDate);
    dateRefused = beforeStart || afterEnd;
  }

  if (minutesChange && scheduledTime) {
    const scheduledTimeDate = extractDate(scheduledTime);
    const currentDayMinutes = timeStringMinutes(extractTime(scheduledTime));
    const newTime = currentDayMinutes + minutesChange;
    // B2: a time must stay within its own day. 24:00 (23:00 + 60) is the next day's 00:00, not this day's,
    // and was written as 00:00 on the SAME date; it is refused exactly as 23:00 + 61 is.
    timeRefused = newTime < 0 || newTime >= dayTotalMinutes;

    if (!timeRefused) {
      const timeString = addMinutesToTimeString(scheduledTime, minutesChange);

      const timeStringDate =
        (scheduledTimeDate && newScheduledDate) || (scheduledDate === scheduledTimeDate && scheduledTimeDate);

      newScheduledTime = timeStringDate ? `${timeStringDate}T${timeString}` : timeString;
    }
  }

  return { dateRefused, timeRefused, newScheduledDate, newScheduledTime };
}
