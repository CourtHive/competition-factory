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

import { isISODateString, extractDate } from '@Tools/plainDate';
import { zeroPad } from '@Tools/dateTimeInternals';
import { timeValidation } from '@Validators/regex';

export function isTimeString(timeString) {
  if (typeof timeString !== 'string') return false;
  const noZ = timeString.split('Z')[0];
  const parts: string[] = noZ.split(':');
  const isNumeric = parts.every((part) => !Number.isNaN(Number.parseInt(part)));
  const invalid = parts.length < 2 || !isNumeric || Number.parseInt(parts[0]) > 23 || Number.parseInt(parts[1]) > 60;
  return !invalid;
}

/** Normalize a time string to `HH:MM`, discarding seconds; undefined when not a time. */
export function tidyTime(timeString): string | undefined {
  return isTimeString(timeString) ? timeString.split(':').slice(0, 2).map(zeroPad).join(':') : undefined;
}

/** The wall-clock part of an ISO string, or of a bare time string. */
export function extractTime(dateString): string | undefined {
  return isISODateString(dateString) && dateString.indexOf('T') > 0
    ? tidyTime(dateString.split('T').reverse()[0])
    : tidyTime(dateString);
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
export function militaryTime(value?): string {
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
export function regularTime(value): string | undefined {
  const time = splitTime(value);
  if (typeof time === 'object' && !Object.keys(time).length) return undefined;

  if (time.ampm) return value;
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

export function convertTime(value, time24?, keepDate?): string | undefined {
  const hasDate = extractDate(value);
  const timeString = extractTime(value);
  const timeValue = hasDate ? timeString : value;

  return value
    ? (time24 && ((hasDate && keepDate && value) || militaryTime(timeValue))) || regularTime(timeValue)
    : undefined;
}

export function validTimeValue(value) {
  const spaceSplit = typeof value === 'string' ? value?.split(' ') : [];
  if (value && spaceSplit?.length > 1 && !['AM', 'PM'].includes(spaceSplit[1].toUpperCase())) return false;

  const converted = convertTime(value, true, true);
  return !!(!value || (converted && timeValidation.test(converted)));
}

/** Minutes elapsed since midnight on the clock — the plainTime as a scalar. */
export function timeStringMinutes(timeString?) {
  const validTimeString = extractTime(timeString);
  if (!validTimeString) return 0;
  const [hours, minutes] = validTimeString.split(':').map((value) => Number.parseInt(value));
  return hours * 60 + minutes;
}

/** Minutes since midnight → `HH:MM`, wrapping past 24h rather than overflowing. */
export function dayMinutesToTimeString(totalMinutes): string {
  let hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes - hours * 60;
  if (hours > 23) hours = hours % 24;
  return [zeroPad(hours), zeroPad(minutes)].join(':');
}

export function HHMMSS(s, format?): string {
  const secondNumber = Number.parseInt(s, 10); // don't forget the second param
  const hours = Math.floor(secondNumber / 3600);
  const minutes = Math.floor((secondNumber - hours * 3600) / 60);
  const seconds = secondNumber - hours * 3600 - minutes * 60;

  const displaySeconds = !format || format?.displaySeconds;
  const timeString = displaySeconds ? hours + ':' + minutes + ':' + seconds : hours + ':' + minutes;
  return timeString.split(':').map(zeroPad).join(':');
}

export function timeSort(a, b) {
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

export const plainTime = {
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
