import { dayMinutesToTimeString, timeStringMinutes } from '@Tools/dateTime';
import { END_OF_DAY } from '@Tools/civilDateTime';

/**
 * A time `minutes` after `timeString` on the SAME day. The scheduler works one day at a time, so a time that would
 * fall past midnight is the end of the day: nothing else can follow it today. Adding minutes to a clock time used to
 * wrap past midnight, so a recovery ending at 00:30 read as long over and a dependent was placed at 23:00 (R5).
 */
export function addMinutesWithinDay(timeString: string | undefined, minutes: number): string {
  const total = timeStringMinutes(timeString) + (Number.isFinite(minutes) ? minutes : 0);
  return total >= 24 * 60 ? END_OF_DAY : dayMinutesToTimeString(Math.max(total, 0));
}
