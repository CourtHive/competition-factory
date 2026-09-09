/**
 * Public zoned-conversion surface — a thin adapter, with no arithmetic of its own.
 *
 * Every conversion here delegates to `@Tools/zonedDateTime`, which is the single
 * implementation. This module exists to keep the published `tools.timeZone`
 * names, shapes and error contract stable; it must never grow a second copy of
 * the offset arithmetic. `zonedDateTime.test.ts` asserts that by identity.
 *
 * Failure is a value, never a throw and never a substituted number. An
 * unrecognised zone, a malformed date and a malformed time are three different
 * errors and are reported as three different errors.
 */

import { INVALID_TIME_ZONE, INVALID_DATE, INVALID_TIME } from '@Constants/errorConditionConstants';
import { zonedWallClockToMs, offsetMinutesAt, zonedParts, isZone } from '@Tools/zonedDateTime';
import { isValidEmbargoDate } from '@Tools/dateTime';

type ZoneError = { error: typeof INVALID_TIME_ZONE | typeof INVALID_DATE | typeof INVALID_TIME };

export function isValidIANATimeZone(timeZone: string): boolean {
  return isZone(timeZone);
}

/**
 * The zone's offset from UTC in minutes, at `date` (default now).
 *
 * `undefined` when the zone is absent or unrecognised. It previously threw a
 * `RangeError` for an unrecognised zone, and returned the HOST machine's offset
 * when the zone was omitted — the same call answering differently on two servers.
 */
export function getTimeZoneOffsetMinutes(timeZone: string, date?: Date): number | undefined {
  return offsetMinutesAt((date ?? new Date()).getTime(), timeZone);
}

/** Venue-local `YYYY-MM-DD` + `HH:MM` → UTC ISO instant. */
export function wallClockToUTC(date: string, time: string, timeZone: string): string | ZoneError {
  if (!isZone(timeZone)) return { error: INVALID_TIME_ZONE };

  const result = zonedWallClockToMs({ date, time, timeZone });
  if (!result) {
    // The zone is known good, so the failure is the date or the time. Re-run the
    // time against a date known to be valid to find out which.
    const timeIsValid = zonedWallClockToMs({ date: '2000-01-01', time, timeZone }) !== null;
    return { error: timeIsValid ? INVALID_DATE : INVALID_TIME };
  }

  return new Date(result.ms).toISOString();
}

/** UTC ISO instant → venue-local calendar date + wall clock. */
export function utcToWallClock(utcIso: string, timeZone: string): { date: string; time: string } | ZoneError {
  if (!isZone(timeZone)) return { error: INVALID_TIME_ZONE };

  const ms = typeof utcIso === 'string' ? Date.parse(utcIso) : Number.NaN;
  if (Number.isNaN(ms)) return { error: INVALID_DATE };

  const parts = zonedParts({ ms, timeZone });
  if (!parts) return { error: INVALID_DATE };

  return { date: parts.date, time: parts.time };
}

/** Venue-local embargo date + time → the UTC instant an embargo is stored as. */
export function toEmbargoUTC(date: string, time: string, timeZone: string): string | ZoneError {
  const result = wallClockToUTC(date, time, timeZone);
  if (typeof result !== 'string') return result;

  // wallClockToUTC already returns a string ending in Z via toISOString()
  if (!isValidEmbargoDate(result)) return { error: INVALID_TIME_ZONE };

  return result;
}

export const timeZone = {
  isValidIANATimeZone,
  getTimeZoneOffsetMinutes,
  wallClockToUTC,
  utcToWallClock,
  toEmbargoUTC,
};
