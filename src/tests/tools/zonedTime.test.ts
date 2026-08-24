import { offsetMinutesAt, zonedParts, zonedWallClockToMs } from '@Tools/zonedTime';
import { describe, expect, it } from 'vitest';

const NY = 'America/New_York';

// US DST 2026: forward 2026-03-08, back 2026-11-01.
const WINTER = Date.parse('2026-01-15T12:00:00.000Z'); // EST, UTC-5
const SUMMER = Date.parse('2026-07-15T12:00:00.000Z'); // EDT, UTC-4

describe('offsetMinutesAt', () => {
  it('returns the offset in force at that instant, not a fixed one', () => {
    expect(offsetMinutesAt(WINTER, NY)).toEqual(-300);
    expect(offsetMinutesAt(SUMMER, NY)).toEqual(-240);
  });

  it('returns undefined without a zone, or for one it cannot resolve', () => {
    expect(offsetMinutesAt(WINTER)).toBeUndefined();
    expect(offsetMinutesAt(WINTER, 'Not/AZone')).toBeUndefined();
  });

  it('handles a zone with no DST at all', () => {
    expect(offsetMinutesAt(WINTER, 'UTC')).toEqual(0);
    expect(offsetMinutesAt(SUMMER, 'UTC')).toEqual(0);
  });
});

describe('zonedWallClockToMs', () => {
  it('converts the same wall clock differently on either side of a DST change', () => {
    const winter = zonedWallClockToMs({ date: '2026-01-15', time: '09:00', timeZone: NY });
    const summer = zonedWallClockToMs({ date: '2026-07-15', time: '09:00', timeZone: NY });
    expect(winter).toEqual(Date.parse('2026-01-15T14:00:00.000Z')); // 09:00 EST
    expect(summer).toEqual(Date.parse('2026-07-15T13:00:00.000Z')); // 09:00 EDT

    // This is the whole point: a single offset cannot produce both.
    const fixed = (date: string) => zonedWallClockToMs({ date, time: '09:00', utcOffsetMinutes: -300 });
    expect(fixed('2026-01-15')).toEqual(winter);
    expect(fixed('2026-07-15')).not.toEqual(summer);
  });

  it('falls back to the fixed offset without a zone, and for an unknown zone', () => {
    const expected = Date.parse('2026-07-15T13:00:00.000Z');
    expect(zonedWallClockToMs({ date: '2026-07-15', time: '09:00', utcOffsetMinutes: -240 })).toEqual(expected);
    // An unrecognised zone must degrade to the previous behaviour, not throw.
    expect(
      zonedWallClockToMs({ date: '2026-07-15', time: '09:00', utcOffsetMinutes: -240, timeZone: 'Not/AZone' }),
    ).toEqual(expected);
  });

  it('returns null for missing or malformed input', () => {
    expect(zonedWallClockToMs({ time: '09:00', timeZone: NY })).toBeNull();
    expect(zonedWallClockToMs({ date: '2026-07-15', timeZone: NY })).toBeNull();
    expect(zonedWallClockToMs({ date: '2026-07-15', time: 'noon', timeZone: NY })).toBeNull();
    expect(zonedWallClockToMs({ date: 'not-a-date', time: '09:00', timeZone: NY })).toBeNull();
  });

  it('round-trips a wall clock through both directions on both sides of the change', () => {
    for (const date of ['2026-01-15', '2026-07-15']) {
      const ms = zonedWallClockToMs({ date, time: '09:00', timeZone: NY })!;
      expect(zonedParts({ ms, timeZone: NY })).toEqual({ date, time: '09:00' });
    }
  });
});

describe('zonedParts', () => {
  it('reports the venue-local clock per instant', () => {
    expect(zonedParts({ ms: WINTER, timeZone: NY })).toEqual({ date: '2026-01-15', time: '07:00' });
    expect(zonedParts({ ms: SUMMER, timeZone: NY })).toEqual({ date: '2026-07-15', time: '08:00' });
  });

  it('uses the fixed offset when no zone is supplied', () => {
    expect(zonedParts({ ms: SUMMER, utcOffsetMinutes: -300 })).toEqual({ date: '2026-07-15', time: '07:00' });
  });

  it('rolls the calendar day when the offset crosses midnight', () => {
    const ms = Date.parse('2026-07-16T02:00:00.000Z');
    expect(zonedParts({ ms, timeZone: NY })).toEqual({ date: '2026-07-15', time: '22:00' });
  });
});
