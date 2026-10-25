import { canonicalDate, canonicalTime } from '@Tools/canonicalClock';

/**
 * Civil date-times (scheduling-pipeline.md § 9.8): a calendar date and a wall-clock time with no zone, on the
 * proleptic Gregorian calendar, in whole minutes. The arithmetic is UTC-instant arithmetic, which has no daylight
 * saving, so it needs no date library and no zone: a date-time is a day count since 1970-01-01 times 1440, plus minutes
 * past midnight. Only a result past midnight is on a later date; one before midnight is on the same date.
 */

export const MINUTES_PER_DAY = 24 * 60;
const MS_PER_DAY = MINUTES_PER_DAY * 60 * 1000;

const pad = (value: number) => String(value).padStart(2, '0');

/** Days since 1970-01-01 of a calendar date, or undefined when it is not a date. */
export function dayNumber(date: unknown): number | undefined {
  const day = canonicalDate(date);
  if (!day) return undefined;
  const [year, month, dayOfMonth] = day.split('-').map(Number);
  return Date.UTC(year, month - 1, dayOfMonth) / MS_PER_DAY;
}

/** The calendar date of a day count since 1970-01-01. */
export function dateOfDayNumber(days: number): string {
  const date = new Date(days * MS_PER_DAY);
  return `${String(date.getUTCFullYear()).padStart(4, '0')}-${pad(date.getUTCMonth() + 1)}-${pad(date.getUTCDate())}`;
}

/** The date `days` after a calendar date (before it, when negative), or undefined when it is not a date. */
export function addDaysToDate(date: unknown, days: number): string | undefined {
  const start = dayNumber(date);
  return start === undefined ? undefined : dateOfDayNumber(start + days);
}

/** A date and a time `minutes` after them, or undefined when either is not one. */
export function addMinutesToDateTime({
  minutes,
  date,
  time,
}: {
  minutes: number;
  date: unknown;
  time: unknown;
}): { date: string; time: string } | undefined {
  const day = dayNumber(date);
  const clock = canonicalTime(time);
  if (day === undefined || !clock || !Number.isInteger(minutes)) return undefined;
  const [hours, minutesOfHour] = clock.split(':').map(Number);
  const total = day * MINUTES_PER_DAY + hours * 60 + minutesOfHour + minutes;
  const resultDay = Math.floor(total / MINUTES_PER_DAY);
  const minutesOfDay = total - resultDay * MINUTES_PER_DAY;
  return {
    date: dateOfDayNumber(resultDay),
    time: `${pad(Math.floor(minutesOfDay / 60))}:${pad(minutesOfDay % 60)}`,
  };
}

/** the last minute of a scheduling day */
export const END_OF_DAY = '23:59';

/**
 * A booking of `minutes` from `startTime`, as its own day holds it: it ends at the end of the day, 23:59, when it would
 * end past midnight, and `minutesPastMidnight` is how far into the next date it runs (§ 9.8). A booking's end used to
 * wrap, so one at 23:30 for 90 minutes ended at 01:00 of the same day, before it started.
 */
export function endOnTheDay(startTime: unknown, minutes?: number): { endTime: string; minutesPastMidnight: number } {
  const clock = canonicalTime(startTime);
  if (!clock) return { endTime: '00:00', minutesPastMidnight: 0 };
  const [hours, minutesOfHour] = clock.split(':').map(Number);
  const end = hours * 60 + minutesOfHour + (Number.isFinite(minutes) ? (minutes as number) : 0);
  if (end >= MINUTES_PER_DAY) return { endTime: END_OF_DAY, minutesPastMidnight: end - MINUTES_PER_DAY };
  const endMinutes = Math.max(end, 0);
  return { endTime: `${pad(Math.floor(endMinutes / 60))}:${pad(endMinutes % 60)}`, minutesPastMidnight: 0 };
}
