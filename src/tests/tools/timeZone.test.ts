import { isValidEmbargoDate } from '@Tools/dateTime';
import { describe, expect, it } from 'vitest';
import {
  isValidIANATimeZone,
  getTimeZoneOffsetMinutes,
  wallClockToUTC,
  utcToWallClock,
  toEmbargoUTC,
} from '@Tools/timeZone';

// constants
import { INVALID_TIME_ZONE, INVALID_DATE, INVALID_TIME } from '@Constants/errorConditionConstants';

const NY = 'America/New_York';

describe('isValidIANATimeZone', () => {
  it('accepts America/New_York', () => {
    expect(isValidIANATimeZone('America/New_York')).toBe(true);
  });
  it('accepts Europe/London', () => {
    expect(isValidIANATimeZone('Europe/London')).toBe(true);
  });
  it('accepts Asia/Kolkata', () => {
    expect(isValidIANATimeZone('Asia/Kolkata')).toBe(true);
  });
  it('accepts UTC', () => {
    expect(isValidIANATimeZone('UTC')).toBe(true);
  });
  it('rejects non-IANA abbreviation', () => {
    expect(isValidIANATimeZone('ACME')).toBe(false);
  });
  it('rejects invalid zone name', () => {
    expect(isValidIANATimeZone('Not/A/Zone')).toBe(false);
  });
  it('rejects empty string', () => {
    expect(isValidIANATimeZone('')).toBe(false);
  });
  it('rejects undefined', () => {
    expect(isValidIANATimeZone(undefined as any)).toBe(false);
  });
});

describe('getTimeZoneOffsetMinutes', () => {
  it('returns -300 for America/New_York in winter (EST)', () => {
    const winter = new Date('2025-01-15T12:00:00Z');
    expect(getTimeZoneOffsetMinutes('America/New_York', winter)).toBe(-300);
  });
  it('returns -240 for America/New_York in summer (EDT)', () => {
    const summer = new Date('2025-06-15T12:00:00Z');
    expect(getTimeZoneOffsetMinutes('America/New_York', summer)).toBe(-240);
  });
  it('returns 0 for UTC', () => {
    expect(getTimeZoneOffsetMinutes('UTC')).toBe(0);
  });
  it('returns 330 for Asia/Kolkata', () => {
    expect(getTimeZoneOffsetMinutes('Asia/Kolkata')).toBe(330);
  });
});

describe('wallClockToUTC', () => {
  it('converts summer EDT correctly', () => {
    const result = wallClockToUTC('2025-06-20', '03:00', 'America/New_York');
    expect(result).toBe('2025-06-20T07:00:00.000Z');
  });
  it('converts winter EST correctly', () => {
    const result = wallClockToUTC('2025-01-15', '03:00', 'America/New_York');
    expect(result).toBe('2025-01-15T08:00:00.000Z');
  });
  it('handles day boundary with Asia/Kolkata', () => {
    const result = wallClockToUTC('2025-06-20', '23:00', 'Asia/Kolkata');
    expect(result).toBe('2025-06-20T17:30:00.000Z');
  });
  it('returns error for invalid timezone', () => {
    const result = wallClockToUTC('2025-06-20', '03:00', 'Invalid/Zone');
    expect(result).toEqual({ error: INVALID_TIME_ZONE });
  });
});

describe('utcToWallClock', () => {
  it('converts UTC to Eastern summer time', () => {
    const result = utcToWallClock('2025-06-20T07:00:00.000Z', 'America/New_York');
    expect(result).toEqual({ date: '2025-06-20', time: '03:00' });
  });
  it('handles day shift', () => {
    const result = utcToWallClock('2025-06-21T03:00:00.000Z', 'America/New_York');
    expect(result).toEqual({ date: '2025-06-20', time: '23:00' });
  });
  it('returns error for invalid timezone', () => {
    const result = utcToWallClock('2025-06-20T07:00:00.000Z', 'Invalid/Zone');
    expect(result).toEqual({ error: INVALID_TIME_ZONE });
  });
});

describe('toEmbargoUTC', () => {
  it('produces a valid embargo string ending in Z', () => {
    const result = toEmbargoUTC('2025-06-20', '03:00', 'America/New_York');
    expect(typeof result).toBe('string');
    expect((result as string).endsWith('Z')).toBe(true);
  });
  it('result passes isValidEmbargoDate check', () => {
    const result = toEmbargoUTC('2025-06-20', '03:00', 'America/New_York');
    expect(isValidEmbargoDate(result)).toBe(true);
  });
  it('returns error for invalid timezone', () => {
    const result = toEmbargoUTC('2025-06-20', '03:00', 'Invalid/Zone');
    expect(result).toEqual({ error: INVALID_TIME_ZONE });
  });
});

describe('failure is a value, never a throw and never a substituted number', () => {
  // Every case below previously threw an uncaught RangeError out of a function
  // whose signature promised `string | { error }`, or returned a plausible
  // number derived from the wrong frame. None of them had a test.

  it('refuses an unrecognised zone instead of throwing', () => {
    expect(() => getTimeZoneOffsetMinutes('Not/AZone')).not.toThrow();
    expect(getTimeZoneOffsetMinutes('Not/AZone')).toBeUndefined();
    expect(wallClockToUTC('2026-07-15', '09:00', 'Not/AZone')).toEqual({ error: INVALID_TIME_ZONE });
    expect(utcToWallClock('2026-07-15T13:00:00.000Z', 'Not/AZone')).toEqual({ error: INVALID_TIME_ZONE });
    expect(toEmbargoUTC('2026-07-15', '09:00', 'Not/AZone')).toEqual({ error: INVALID_TIME_ZONE });
  });

  it('does not read the host machine clock when the zone is omitted', () => {
    // This returned the offset of whichever server happened to run it, so the
    // same call answered differently in New York and in London.
    expect(getTimeZoneOffsetMinutes(undefined as any)).toBeUndefined();
    expect(getTimeZoneOffsetMinutes('' as any)).toBeUndefined();
  });

  it('distinguishes a malformed date from a malformed time', () => {
    expect(wallClockToUTC('not-a-date', '09:00', NY)).toEqual({ error: INVALID_DATE });
    expect(wallClockToUTC('2026-07-15', 'noon', NY)).toEqual({ error: INVALID_TIME });
    expect(toEmbargoUTC('not-a-date', '09:00', NY)).toEqual({ error: INVALID_DATE });
  });

  it('refuses an unparseable instant', () => {
    expect(utcToWallClock('garbage', NY)).toEqual({ error: INVALID_DATE });
    expect(utcToWallClock(undefined as any, NY)).toEqual({ error: INVALID_DATE });
  });

  it('still converts correctly across a DST boundary', () => {
    // The transition weekend the whole zoned intent exists for, which this
    // file previously had no case for at all.
    expect(wallClockToUTC('2026-01-15', '09:00', NY)).toEqual('2026-01-15T14:00:00.000Z');
    expect(wallClockToUTC('2026-07-15', '09:00', NY)).toEqual('2026-07-15T13:00:00.000Z');
    expect(utcToWallClock('2026-11-01T05:30:00.000Z', NY)).toEqual({ date: '2026-11-01', time: '01:30' });
  });
});
