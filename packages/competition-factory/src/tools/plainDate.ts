/**
 * `plainDate` — a calendar day, with no time and no zone.
 *
 * The intent this module owns is "which day", answered without reference to a
 * clock or a location: `2026-09-09` is the same plainDate whether it is read in
 * Auckland or Los Angeles. Nothing here resolves an offset, and nothing here is
 * a point in time — a plainDate has no instant to be at.
 *
 * The wire format is an ISO date string (`YYYY-MM-DD`). Functions take and
 * return strings; `Date` appears only as internal arithmetic. That boundary is
 * deliberate: it is what lets the bodies below become `Temporal.PlainDate`
 * operations later without any caller changing.
 *
 * Siblings: `plainTime` (a wall clock with no day), and — for anything that
 * needs an offset or an absolute moment — `timeZone` / `zonedDateTime`.
 */

import { canonicalDate } from '@Tools/canonicalClock';
import { isDate } from '@Tools/dateTimeInternals';
import { now } from '@Tools/clock';

// matches valid ISO date string
const re =
  /^([+-]?\d{4}(?!\d{2}\b))((-?)((0[1-9]|1[0-2])(\3([12]\d|0[1-9]|3[01]))?|W([0-4]\d|5[0-2])(-?[1-7])?|(00[1-9]|0[1-9]\d|[12]\d{2}|3([0-5]\d|6[1-6])))([T\s]((([01]\d|2[0-3])((:?)[0-5]\d)?|24:?00)([.,]\d+(?!:))?)?(\17[0-5]\d([.,]\d+)?)?([zZ]|([+-])([01]\d|2[0-3]):?([0-5]\d)?)?)?)?$/; //NOSONAR

export function isISODateString(dateString) {
  if (typeof dateString !== 'string') return false;
  return re.test(dateString);
}

/** Whether a value is a real calendar date, `YYYY-MM-DD` or an ISO date-time's date (`canonicalClock.ts`). */
export function isValidDateString(scheduleDate) {
  return canonicalDate(scheduleDate) !== undefined;
}

/**
 * The calendar day of a `YYYY-MM-DD` date or an ISO date-time, discarding any time and any zone designator; '' for
 * anything else: a day not on the calendar (`2026-02-30`), a date and time separated by a space, or another ISO shape
 * (`2026-W10`, `2026-061`, `20260302`, `2026-03`).
 */
export function extractDate(dateString): string {
  return canonicalDate(dateString) ?? '';
}

export function formatDate(date?, separator = '-', format = 'YMD'): string {
  if (!date) return '';
  if (typeof date === 'string' && !date.includes('T')) date = date + 'T00:00';

  const d = new Date(date);
  let month = '' + (d.getMonth() + 1);
  let day = '' + d.getDate();
  const year = d.getFullYear();

  if (month.length < 2) month = '0' + month;
  if (day.length < 2) day = '0' + day;

  if (format === 'DMY') return [day, month, year].join(separator);
  if (format === 'MDY') return [month, day, year].join(separator);
  if (format === 'YDM') return [year, day, month].join(separator);
  if (format === 'DYM') return [day, year, month].join(separator);
  if (format === 'MYD') return [month, year, day].join(separator);
  return [year, month, day].join(separator);
}

function isValidDateRange(minDate, maxDate) {
  return minDate <= maxDate;
}

/** Every calendar day from `startDt` to `endDt` inclusive, capped at 300 days. */
export function generateDateRange(startDt?, endDt?): string[] {
  if (!isValidDateString(startDt) || !isValidDateString(endDt)) return [];

  const startDateString = extractDate(startDt) + 'T00:00';
  const endDateString = extractDate(endDt) + 'T00:00';
  const startDate = new Date(startDateString);
  const endDate = new Date(endDateString);
  const process = isDate(endDate) && isDate(startDate) && isValidDateRange(startDate, endDate);
  const between: Date[] = [];
  let iterations = 0;

  if (process) {
    const currentDate = startDate;
    let dateSecs = currentDate.getTime();
    while (dateSecs <= endDate.getTime() && iterations < 300) {
      iterations += 1;
      // must be a *new* Date otherwise it is an array of the same object
      between.push(new Date(currentDate));
      dateSecs = currentDate.setDate(currentDate.getDate() + 1);
    }
  }

  return between.map((date) => formatDate(date));
}

export function addDays(date, days = 7): string {
  const universalDate = extractDate(date) + 'T00:00';
  const now = new Date(universalDate);
  const adjustedDate = new Date(now.setDate(now.getDate() + days));
  return formatDate(adjustedDate);
}

export function addWeek(date): string {
  return addDays(date);
}

export function subtractWeek(date, dateFormat?): string {
  const universalDate = extractDate(date) + 'T00:00';
  const now = new Date(universalDate);
  // NOTE: `dateFormat` arrives in formatDate's `separator` position. Preserved
  // verbatim from the pre-split implementation — changing it here would be a
  // silent behaviour change, not a refactor.
  return formatDate(now.setDate(now.getDate() - 7), dateFormat);
}

export function getDateByWeek(week, year, dateFormat, sunday = false): string {
  const date = new Date(year, 0, 1 + (week - 1) * 7);
  const startValue = sunday ? 0 : 1;
  date.setDate(date.getDate() + (startValue - date.getDay()));
  // NOTE: `dateFormat` in the `separator` position — see subtractWeek.
  return formatDate(date, dateFormat);
}

export function dateFromDay(year, day, dateFormat?): string {
  const date = new Date(year, 0); // initialize a date in `year-01-01`
  // NOTE: `dateFormat` in the `separator` position — see subtractWeek.
  return formatDate(new Date(date.setDate(day)), dateFormat); // add the number of days
}

export function dateStringDaysChange(dateString, daysChange): string | undefined {
  const date = new Date(dateString);
  date.setUTCDate(date.getUTCDate() + daysChange);
  return extractDate(date.toISOString());
}

export function weekdays(date: any = now(), firstDayOfWeek = 0): string[] {
  if (!isDate(date)) return [];
  const dates = [0, 1, 2, 3, 4, 5, 6].map((i) => dayOfWeek(date, i + firstDayOfWeek));
  return dates;

  function dayOfWeek(date, index) {
    const d = new Date(date);
    const day = d.getDay();
    const diff = index - day;

    const nextDate = new Date(d.setDate(d.getDate() + diff));
    return formatDate(nextDate);
  }
}

/**
 * Whether two values are on the same calendar day (scheduling-pipeline.md § 3.8 rule 7). A date or date-time string is
 * read as written, its time and any zone designator discarded, so no runtime zone enters: `2026-03-02` and
 * `2026-03-02T20:00-05:00` are the same day everywhere. A string that is not a date is the same day as nothing. Two
 * `Date` objects are compared in the runtime's zone, as before.
 */
export function sameDay(date1, date2) {
  if (typeof date1 === 'string' || typeof date2 === 'string') {
    const day = canonicalDate(date1);
    return day !== undefined && day === canonicalDate(date2);
  }
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return d1.getFullYear() === d2.getFullYear() && d1.getMonth() === d2.getMonth() && d1.getDate() === d2.getDate();
}

export function isDateInPast(dateString: string): boolean {
  return new Date(dateString) < now();
}

export function localizeDate(submittedDate, dateLocalization, locale): string | undefined {
  const date = new Date(submittedDate);
  if (!isDate(date)) return undefined;
  const defaultLocalization = {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  };
  return date.toLocaleDateString(locale, dateLocalization || defaultLocalization);
}

export const plainDate = {
  dateStringDaysChange,
  generateDateRange,
  isValidDateString,
  isISODateString,
  getDateByWeek,
  isDateInPast,
  localizeDate,
  dateFromDay,
  subtractWeek,
  extractDate,
  formatDate,
  weekdays,
  addWeek,
  sameDay,
  addDays,
};
