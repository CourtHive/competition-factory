/**
 * Legacy date/time surface — kept intact so no caller has to move.
 *
 * The calendar intents this file used to conflate now live in dedicated modules:
 * `@Tools/plainDate` (a calendar day), `@Tools/plainTime` (a wall clock), and
 * `@Tools/timeZone` / `@Tools/zonedTime` (an offset-resolved moment). Those are
 * the modules to reach for in new code — they say which intent is meant, which
 * this file's flat namespace never could.
 *
 * Everything below is either re-exported from those modules or is a helper that
 * still mixes intents (an instant, or a wall clock resolved against one). Names,
 * signatures and behaviour are unchanged.
 */

import {
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
} from '@Tools/plainDate';
import {
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
} from '@Tools/plainTime';
import { dateValidation, timeValidation, validDateString } from '@Validators/regex';
import { isDateObject, zeroPad, isDate } from '@Tools/dateTimeInternals';

export {
  dayMinutesToTimeString,
  dateStringDaysChange,
  isValidDateString,
  generateDateRange,
  timeStringMinutes,
  isISODateString,
  getDateByWeek,
  validTimeValue,
  isDateInPast,
  isDateObject,
  localizeDate,
  militaryTime,
  isTimeString,
  regularTime,
  dateFromDay,
  subtractWeek,
  convertTime,
  extractDate,
  extractTime,
  formatDate,
  splitTime,
  weekdays,
  timeSort,
  tidyTime,
  zeroPad,
  addWeek,
  sameDay,
  addDays,
  HHMMSS,
  isDate,
};

export function getIsoDateString(schedule): string | undefined {
  let { scheduledDate } = schedule;
  if (!scheduledDate && schedule.scheduledTime) scheduledDate = extractDate(schedule.scheduledTime);
  if (!scheduledDate) return;

  const extractedTime = extractTime(schedule.scheduledTime);
  let isoDateString = extractDate(scheduledDate);
  if (isoDateString && extractedTime) isoDateString += `T${extractedTime}`;
  return isoDateString;
}

export function DateHHMM(date): string {
  const dt = new Date(date);
  const secs = dt.getSeconds() + 60 * dt.getMinutes() + 60 * 60 * dt.getHours();
  return HHMMSS(secs, { displaySeconds: false });
}

export const getUTCdateString = (date?): string => {
  const dateDate = isDate(date) || isISODateString(date) ? new Date(date) : new Date();
  const monthNumber = dateDate.getUTCMonth() + 1;
  const utcMonth = monthNumber < 10 ? `0${monthNumber}` : `${monthNumber}`;
  return `${dateDate.getUTCFullYear()}-${zeroPad(utcMonth)}-${zeroPad(dateDate.getUTCDate())}`;
};

export function timeUTC(date?) {
  const dateDate = isDate(date) || isISODateString(date) ? new Date(date) : new Date();
  return Date.UTC(dateDate.getFullYear(), dateDate.getMonth(), dateDate.getDate());
}

export function offsetDate(date): Date {
  const targetTime = date ? new Date(date) : new Date();
  const tzDifference = targetTime.getTimezoneOffset();
  return new Date(targetTime.getTime() - tzDifference * 60 * 1000);
}

export function offsetTime(date?) {
  return offsetDate(date).getTime();
}

export function isValidEmbargoDate(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  if (!isISODateString(value)) return false;
  // Must include a timezone indicator (Z or ±HH:MM offset)
  return /([zZ]|[+-]\d{2}:?\d{2})$/.test(value);
}

export function timeToDate(timeString, date: string | undefined = undefined): Date {
  const [hours, minutes] = (timeString || '00:00').split(':').map(zeroPad);
  const milliseconds = offsetDate(date).setHours(hours, minutes, 0, 0);
  return offsetDate(milliseconds);
}

export function minutesDifference(date1, date2, absolute = true) {
  const dt1 = new Date(date1);
  const dt2 = new Date(date2);
  const diff = (dt2.getTime() - dt1.getTime()) / 1000 / 60;
  return absolute ? Math.abs(Math.round(diff)) : Math.round(diff);
}

export function addMinutes(startDate, minutes): Date {
  const date = new Date(startDate);
  return new Date(date.getTime() + minutes * 60000);
}

export function addMinutesToTimeString(timeString?, minutes?): string {
  const validTimeString = extractTime(timeString);
  if (!validTimeString) return '00:00';
  const minutesToAdd = Number.isNaN(minutes) ? 0 : minutes;
  return extractTime(addMinutes(timeToDate(validTimeString), minutesToAdd).toISOString()) || '00:00';
}

export const dateTime = {
  addDays,
  addWeek,
  addMinutesToTimeString,
  convertTime,
  getIsoDateString,
  getUTCdateString,
  DateHHMM,
  extractDate,
  extractTime,
  formatDate,
  getDateByWeek,
  isISODateString,
  isValidEmbargoDate,
  isDate,
  isTimeString,
  offsetDate,
  offsetTime,
  sameDay,
  timeStringMinutes,
  timeToDate,
  timeUTC,
  validTimeValue,
  validDateString,
  timeValidation,
  dateValidation,
};
