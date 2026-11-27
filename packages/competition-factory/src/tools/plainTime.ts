/**
 * `plainTime` — a wall clock, with no day and no zone.
 *
 * The intent this module owns is "what time on the clock", answered without a
 * calendar day and without an offset. `14:00` is a plainTime; it is not a moment
 * until a day and a zone are supplied. Nothing here resolves an offset, and
 * nothing here decides which day a time belongs to.
 *
 * The wire format is `HH:MM` (24-hour). `convertTime`, `militaryTime` and
 * `regularTime` cross between that and 12-hour display strings, which is a
 * presentation concern rather than an arithmetic one.
 *
 * Siblings: `plainDate` (a calendar day with no clock), and — for anything that
 * needs an offset or an absolute moment — `timeZone` / `zonedDateTime`.
 */

import { timeValidation } from '@Tools/dateTimePatterns';
import { canonicalTime } from '@Tools/canonicalClock';
import { zeroPad } from '@Tools/dateTimeInternals';
import { extractDate } from '@Tools/plainDate';

/** Whether a value is a time (`canonicalClock.ts`: `HH:MM` and the forms that convert to it unambiguously). */
export function isTimeString(timeString: unknown): boolean {
  return canonicalTime(timeString) !== undefined;
}

/** A time as `HH:MM`, seconds discarded, a 12-hour time converted; undefined when not a time. */
export function tidyTime(timeString: unknown): string | undefined {
  return canonicalTime(timeString);
}

/** The wall-clock part of an ISO date-time, or a bare time, as `HH:MM`; undefined when not a time. */
export function extractTime(dateString: unknown): string | undefined {
  return canonicalTime(dateString);
}

export function splitTime(value) {
  value = typeof value === 'string' ? value : '00:00';
  const o: any = {},
    time: any = {};
  ({ 0: o.time, 1: o.ampm } = value.split(' ') ?? []);
  ({ 0: time.hours, 1: time.minutes } = o.time.split(':') ?? []);
  time.ampm = o.ampm;

  if (
    Number.isNaN(Number.parseInt(time.hours)) ||
    Number.isNaN(Number.parseInt(time.minutes)) ||
    (time.ampm && !['AM', 'PM'].includes(time.ampm.toUpperCase()))
  )
    return {};
  return time;
}

/** 12-hour display string → 24-hour `HH:MM`. */
export function militaryTime(value?: unknown): string {
  const time = splitTime(value);
  if (time.ampm && time.hours) {
    if (time.ampm.toLowerCase() === 'pm' && Number.parseInt(time.hours) < 12)
      time.hours = ((time.hours && Number.parseInt(time.hours)) || 0) + 12;
    if (time.ampm.toLowerCase() === 'am' && time.hours === '12') time.hours = '00';
  }
  const timeString = `${time.hours || '12'}:${time.minutes || '00'}`;
  return timeString.split(':').map(zeroPad).join(':');
}

/** 24-hour `HH:MM` → 12-hour display string. */
export function regularTime(value: unknown): string | undefined {
  const time = splitTime(value);
  if (typeof time === 'object' && !Object.keys(time).length) return undefined;

  if (time.ampm) return value as string;
  if (time.hours > 12) {
    time.hours -= 12;
    time.ampm = 'PM';
  } else if (time.hours === '12') {
    time.ampm = 'PM';
  } else if (time.hours === '00') {
    time.hours = '12';
    time.ampm = 'AM';
  } else {
    time.ampm = 'AM';
  }
  if (time.hours?.[0] === '0') {
    time.hours = time.hours.slice(1);
  }

  return `${time.hours || '12'}:${time.minutes || '00'} ${time.ampm}`;
}

export function convertTime(value: unknown, time24?: boolean, keepDate?: boolean): string | undefined {
  const hasDate = extractDate(value);
  const timeString = extractTime(value);
  const timeValue = hasDate ? timeString : value;

  return value
    ? (time24 && ((hasDate && keepDate && (value as string)) || militaryTime(timeValue))) || regularTime(timeValue)
    : undefined;
}

export function validTimeValue(value: unknown): boolean {
  const spaceSplit = typeof value === 'string' ? value?.split(' ') : [];
  if (value && spaceSplit?.length > 1 && !['AM', 'PM'].includes(spaceSplit[1].toUpperCase())) return false;

  // `splitTime` returns {} for anything it cannot parse, and that is the ONLY signal that the input
  // was not a time at all. `militaryTime` DISCARDS it: it builds `${hours || '12'}:${minutes || '00'}`,
  // so every unparseable string converts to NOON and then sails through `timeValidation`.
  //
  // Measured 2026-09-23: 'TBD', 'N/A', '-', 'noon', 'not-a-time' and a bare '12' were all accepted
  // and STORED as '12:00' with no error — a director typing anything into a scheduled-time field
  // silently scheduled the matchUp at midday. Inverted, too: the junk passed while the legitimate
  // '2026-09-23 08:00' was refused by the AM/PM check above.
  //
  // Honoured HERE rather than in `militaryTime`, whose '12:00' fallback has callers that depend on
  // it for display; this is the function whose job is to answer yes or no.
  if (typeof value === 'string' && value && !Object.keys(splitTime(value)).length) return false;

  const converted = convertTime(value, true, true);
  return !!(!value || (converted && timeValidation.test(converted)));
}

/** Minutes elapsed since midnight on the clock — the plainTime as a scalar. */
export function timeStringMinutes(timeString?: unknown): number {
  const validTimeString = extractTime(timeString);
  if (!validTimeString) return 0;
  const [hours, minutes] = validTimeString.split(':').map((value) => Number.parseInt(value));
  return hours * 60 + minutes;
}

/** Minutes since midnight → `HH:MM`, wrapping past 24h rather than overflowing. */
export function dayMinutesToTimeString(totalMinutes: number): string {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes - hours * 60;
  if (hours > 23) hours = hours % 24;
  return [zeroPad(hours), zeroPad(minutes)].join(':');
}

export function HHMMSS(s: number | string, format?: { displaySeconds?: boolean }): string {
  const secondNumber = Number.parseInt(s as string, 10); // don't forget the second param
  const hours = Math.floor(secondNumber / 3600);
  const minutes = Math.floor((secondNumber - hours * 3600) / 60);
  const seconds = secondNumber - hours * 3600 - minutes * 60;

  const displaySeconds = !format || format?.displaySeconds;
  const timeString = displaySeconds ? hours + ':' + minutes + ':' + seconds : hours + ':' + minutes;
  return timeString.split(':').map(zeroPad).join(':');
}

export function timeSort(a: unknown, b: unknown): number {
  const as = splitTime(a);
  const bs = splitTime(b);
  if (Number.parseInt(as.hours) < Number.parseInt(bs.hours)) return -1;
  if (Number.parseInt(as.hours) > Number.parseInt(bs.hours)) return 1;
  if (as.hours === bs.hours) {
    if (Number.parseInt(as.minutes) < Number.parseInt(bs.minutes)) return -1;
    if (Number.parseInt(as.minutes) > Number.parseInt(bs.minutes)) return 1;
  }
  return 0;
}

/** A time's parts as `splitTime` reads them, as strings; empty when the value is not a time. */
type SplitTime = { hours?: string; minutes?: string; ampm?: string };

type PlainTime = {
  dayMinutesToTimeString: typeof dayMinutesToTimeString;
  timeStringMinutes: typeof timeStringMinutes;
  validTimeValue: typeof validTimeValue;
  militaryTime: typeof militaryTime;
  isTimeString: typeof isTimeString;
  regularTime: typeof regularTime;
  convertTime: typeof convertTime;
  extractTime: typeof extractTime;
  splitTime: (value: unknown) => SplitTime;
  timeSort: typeof timeSort;
  tidyTime: typeof tidyTime;
  HHMMSS: typeof HHMMSS;
};

export const plainTime: PlainTime = {
  dayMinutesToTimeString,
  timeStringMinutes,
  validTimeValue,
  militaryTime,
  isTimeString,
  regularTime,
  convertTime,
  extractTime,
  splitTime,
  timeSort,
  tidyTime,
  HHMMSS,
};
