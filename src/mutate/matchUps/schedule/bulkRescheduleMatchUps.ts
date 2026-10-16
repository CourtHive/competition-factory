import { addMatchUpScheduleItems } from '@Mutate/matchUps/schedule/scheduleItems/scheduleItems';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { getTournamentInfo } from '@Query/tournaments/getTournamentInfo';
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
import { INVALID_VALUES, MISSING_MATCHUP_IDS, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type BulkRescheduleMatchUpsArgs = {
  tournamentRecords: TournamentRecords;
  tournamentRecord: Tournament;
  matchUpIds: string[];
  scheduleChange: any;
  dryRun?: boolean;
};
export function bulkRescheduleMatchUps(params: BulkRescheduleMatchUpsArgs): ResultType & {
  allRescheduled?: boolean;
  notRescheduled?: HydratedMatchUp[];
  rescheduled?: HydratedMatchUp[];
} {
  const { scheduleChange, matchUpIds, dryRun } = params;
  if (!matchUpIds || !Array.isArray(matchUpIds)) return { error: MISSING_MATCHUP_IDS };
  if (typeof scheduleChange !== 'object') return { error: INVALID_VALUES };

  const tournamentRecords = resolveTournamentRecords(params);

  const rescheduled: HydratedMatchUp[] = [];
  let notRescheduled: HydratedMatchUp[] = [];

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = bulkReschedule({
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

    if (removeFromNotScheduledIds.length) {
      notRescheduled =
        result?.notRescheduled?.filter(({ matchUpId }) => !removeFromNotScheduledIds.includes(matchUpId)) ?? [];
    }
  }

  const allRescheduled = !!(rescheduled.length && !notRescheduled.length);

  return { ...SUCCESS, rescheduled, notRescheduled, allRescheduled };
}
/**
 *
 * @param {object} tournamentRecord - passed in automatically by tournamentEngine
 * @param {string[]} matchUpIds - array of matchUpIds to be scheduled
 * @param {object} scheduleChange - { minutesChange, daysChange }
 *
 */

type BulkRescheduleArgs = {
  tournamentRecords?: TournamentRecords;
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
  const { startDate, endDate } = tournamentInfo;

  const drawIdMap = groupByDrawId(scheduledNotCompletedMatchUps);

  const rescheduledMatchUpIds: string[] = [];
  const notRescheduledMatchUpIds: string[] = [];

  for (const drawId of Object.keys(drawIdMap)) {
    const result = findDrawDefinition({ tournamentRecord, drawId });
    if (result.error) return result;
    const drawDefinition = result.drawDefinition;

    const drawMatchUpIds = drawIdMap[drawId].filter((matchUpId) => matchUpIds.includes(matchUpId));

    for (const matchUpId of drawMatchUpIds) {
      if (!matchUpId || !drawDefinition) continue;

      const rescheduleResult = rescheduleMatchUp({
        scheduledNotCompletedMatchUps,
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

function rescheduleMatchUp({
  scheduledNotCompletedMatchUps,
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
}): ResultType | undefined {
  const dayTotalMinutes = 1440;
  const inContextMatchUp = scheduledNotCompletedMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  const schedule = inContextMatchUp?.schedule;
  const { scheduledTime, scheduledDate } = schedule;

  // Each change is a separate verdict and EITHER refuses the matchUp. B1: the minutes verdict used to
  // overwrite the days verdict, so { daysChange: 1, minutesChange: 30 } on endDate was written to endDate + 1.
  let dateRefused = false;
  let timeRefused = false;
  let newScheduledTime, newScheduledDate;
  if (daysChange && scheduledDate) {
    const currentDate = extractDate(scheduledDate);
    newScheduledDate = dateStringDaysChange(currentDate, daysChange);

    dateRefused = new Date(newScheduledDate) < new Date(startDate) || new Date(newScheduledDate) > new Date(endDate);
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

  if (dateRefused || timeRefused) {
    notRescheduledMatchUpIds.push(matchUpId);
    return undefined;
  }

  if (!dryRun && (newScheduledTime || newScheduledDate)) {
    // Written through addMatchUpScheduleItems so a re-dated matchUp leaves the old day's grid (B3): its courtOrder,
    // court and venue were a position on THAT day's grid, and a date change clears them exactly as it does for
    // scheduleMatchUps. The tournamentRecord also lets the date's own range check run. Chronology is not checked
    // and a schedule lock does not refuse, as before: a bulk shift moves every listed matchUp together.
    const result = addMatchUpScheduleItems({
      schedule: {
        ...(newScheduledDate ? { scheduledDate: newScheduledDate } : {}),
        ...(newScheduledTime ? { scheduledTime: newScheduledTime } : {}),
      },
      overrideScheduleLock: true,
      checkChronology: false,
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpId,
    });
    if (result.error) return result;
  }
  if (newScheduledTime || newScheduledDate) {
    rescheduledMatchUpIds.push(matchUpId);
  }
  return undefined;
}
