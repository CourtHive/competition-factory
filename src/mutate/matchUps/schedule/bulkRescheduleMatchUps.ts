import { addMatchUpScheduledDate } from '@Mutate/matchUps/schedule/scheduleItems/addMatchUpScheduledDate';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
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

type BulkRescheduleMatchUpsArgs = {
  tournamentRecords: TournamentRecords;
  tournamentRecord: Tournament;
  matchUpIds: string[];
  scheduleChange: any;
  dryRun?: boolean;
};
export function bulkRescheduleMatchUps(params: BulkRescheduleMatchUpsArgs): ResultType & {
  allRescheduled?: boolean;
  notRescheduled?: any[];
  rescheduled?: any[];
} {
  const { scheduleChange, matchUpIds, dryRun } = params;
  if (!matchUpIds || !Array.isArray(matchUpIds)) return { error: MISSING_MATCHUP_IDS };
  if (typeof scheduleChange !== 'object') return { error: INVALID_VALUES };

  const tournamentRecords = resolveTournamentRecords(params);

  const rescheduled: any[] = [];
  let notRescheduled: any[] = [];

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = bulkReschedule({
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
        result?.notRescheduled?.filter(({ matchUpId }) => !removeFromNotScheduledIds.includes(matchUpId)) || [];
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

export function bulkReschedule({ tournamentRecord, scheduleChange, matchUpIds, dryRun }) {
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

  const allRescheduled = rescheduled.length && !notRescheduled.length;

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
  drawDefinition,
  minutesChange,
  daysChange,
  startDate,
  matchUpId,
  endDate,
  dryRun,
}) {
  const dayTotalMinutes = 1440;
  const inContextMatchUp = scheduledNotCompletedMatchUps.find((matchUp) => matchUp.matchUpId === matchUpId);
  const schedule = inContextMatchUp?.schedule;
  const { scheduledTime, scheduledDate } = schedule;

  let doNotReschedule, newScheduledTime, newScheduledDate;
  if (!doNotReschedule && daysChange && scheduledDate) {
    const currentDate = extractDate(scheduledDate);
    newScheduledDate = dateStringDaysChange(currentDate, daysChange);

    doNotReschedule =
      new Date(newScheduledDate) < new Date(startDate) || new Date(newScheduledDate) > new Date(endDate);
  }

  if (minutesChange && scheduledTime) {
    const scheduledTimeDate = extractDate(scheduledTime);
    const currentDayMinutes = timeStringMinutes(extractTime(scheduledTime));
    const newTime = currentDayMinutes + minutesChange;
    doNotReschedule = newTime < 0 || newTime > dayTotalMinutes;

    if (!doNotReschedule) {
      const timeString = addMinutesToTimeString(scheduledTime, minutesChange);

      const timeStringDate =
        (scheduledTimeDate && newScheduledDate) || (scheduledDate === scheduledTimeDate && scheduledTimeDate);

      newScheduledTime = timeStringDate ? `${timeStringDate}T${timeString}` : timeString;
    }
  }

  if (doNotReschedule) {
    notRescheduledMatchUpIds.push(matchUpId);
    return;
  }

  if (!dryRun) {
    if (newScheduledTime) {
      const result = addMatchUpScheduledTime({
        scheduledTime: newScheduledTime,
        drawDefinition,
        matchUpId,
      });
      if (result.error) return result;
    }
    if (newScheduledDate) {
      const result = addMatchUpScheduledDate({
        scheduledDate: newScheduledDate,
        drawDefinition,
        matchUpId,
      });
      if (result.error) return result;
    }
  }
  if (newScheduledTime || newScheduledDate) {
    rescheduledMatchUpIds.push(matchUpId);
  }
}
