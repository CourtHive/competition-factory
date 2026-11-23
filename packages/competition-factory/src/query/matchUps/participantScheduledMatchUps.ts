import { extractDate, extractTime, timeSort } from '@Tools/dateTime';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import { validMatchUps } from '@Validators/validMatchUp';

// constants and types
import { INVALID_VALUES, MISSING_MATCHUPS } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';

/**
 * Retrieves the scheduled matchUps for participants.
 *
 * @param {Object} options - The options for retrieving scheduled match-ups.
 * @param {string[]} options.scheduleAttributes - The attributes to include in the schedule.
 * @param {HydratedMatchUp[]} options.matchUps - The match-ups to filter and sort.
 *
 * @returns {Object} - The scheduled match-ups organized by scheduled date and sorted by scheduled time.
 * @property {Object} scheduledMatchUps - The scheduled match-ups organized by scheduled date and sorted by scheduled time.
 * @property {string[]} scheduledMatchUps[date] - The match-ups scheduled for the specified date.
 */

type ParticiapntScheduledMatchUps = {
  scheduleAttributes?: string[];
  matchUps?: HydratedMatchUp[];
};

export function participantScheduledMatchUps({
  scheduleAttributes = ['scheduledDate', 'scheduledTime'],
  matchUps = [],
}: ParticiapntScheduledMatchUps) {
  if (!validMatchUps(matchUps)) return { error: MISSING_MATCHUPS };
  if (!Array.isArray(scheduleAttributes)) return { error: INVALID_VALUES };

  const scheduledMatchUps = matchUps
    .filter(Boolean)
    .filter(({ schedule }) => hasSchedule({ schedule, scheduleAttributes }))
    .reduce((dateMatchUps, matchUp) => {
      const { schedule } = matchUp;
      const date = extractDate(schedule?.scheduledDate);
      const time = extractTime(schedule?.scheduledTime);
      if (date && time) {
        if (dateMatchUps[date]) {
          dateMatchUps[date].push(matchUp);
        } else {
          dateMatchUps[date] = [matchUp];
        }
      }
      return dateMatchUps;
    }, {});

  // sort all date matchUps
  const dates = Object.keys(scheduledMatchUps);
  dates.forEach((date) => {
    scheduledMatchUps[date].sort((a, b) =>
      timeSort(extractTime(a.schedule?.scheduledTime), extractTime(b.schedule?.scheduledTime)),
    );
  });

  return { ...SUCCESS, scheduledMatchUps };
}
