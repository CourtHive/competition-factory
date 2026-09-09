import { offsetMinutesAt, zonedParts, zonedWallClockToMs, isZone } from '@Tools/zonedDateTime';
import { getTimeZoneOffsetMinutes, isValidIANATimeZone } from '@Tools/timeZone';
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

  it('returns undefined rather than throwing on a non-finite instant', () => {
    expect(offsetMinutesAt(Number.NaN, NY)).toBeUndefined();
    expect(offsetMinutesAt(Number.POSITIVE_INFINITY, NY)).toBeUndefined();
  });

  it('handles a zone with no DST at all', () => {
    expect(offsetMinutesAt(WINTER, 'UTC')).toEqual(0);
    expect(offsetMinutesAt(SUMMER, 'UTC')).toEqual(0);
  });

  it('never returns negative zero', () => {
    // `toEqual` cannot see this; `Object.is` can, and so can a Map keyed on the
    // offset. A zone at offset 0 is the case that produces it.
    expect(Object.is(offsetMinutesAt(SUMMER, 'UTC'), -0)).toEqual(false);
    expect(offsetMinutesAt(SUMMER, 'UTC')).toBe(0);
    expect(offsetMinutesAt(SUMMER, 'Europe/London')).toBe(60);
  });
});

describe('isZone', () => {
  it('recognises real zones and refuses everything else', () => {
    expect(isZone(NY)).toEqual(true);
    expect(isZone('UTC')).toEqual(true);
    expect(isZone('Not/AZone')).toEqual(false);
    expect(isZone('')).toEqual(false);
    expect(isZone(undefined)).toEqual(false);
  });
});

describe('zonedWallClockToMs', () => {
  it('converts the same wall clock differently on either side of a DST change', () => {
    const winter = zonedWallClockToMs({ date: '2026-01-15', time: '09:00', timeZone: NY });
    const summer = zonedWallClockToMs({ date: '2026-07-15', time: '09:00', timeZone: NY });
    expect(winter).toEqual({ ms: Date.parse('2026-01-15T14:00:00.000Z'), source: 'zone' }); // 09:00 EST
    expect(summer).toEqual({ ms: Date.parse('2026-07-15T13:00:00.000Z'), source: 'zone' }); // 09:00 EDT

    // This is the whole point: a single offset cannot produce both.
    const fixed = (date: string) => zonedWallClockToMs({ date, time: '09:00', utcOffsetMinutes: -300 })?.ms;
    expect(fixed('2026-01-15')).toEqual(winter?.ms);
    expect(fixed('2026-07-15')).not.toEqual(summer?.ms);
  });

  it('uses the caller offset when no zone is supplied, and says so', () => {
    // No zone means the caller declared its own frame. That is legitimate, and
    // `source` makes it visible rather than leaving the caller to assume.
    expect(zonedWallClockToMs({ date: '2026-07-15', time: '09:00', utcOffsetMinutes: -240 })).toEqual({
      ms: Date.parse('2026-07-15T13:00:00.000Z'),
      source: 'offset',
    });
  });

  it('REFUSES an unrecognised zone rather than substituting the caller offset', () => {
    // Previously this silently fell back, producing a plausible number in the
    // wrong frame. A zone the caller named and the system cannot honour is a
    // config error, not an occasion for a different answer.
    expect(
      zonedWallClockToMs({ date: '2026-07-15', time: '09:00', utcOffsetMinutes: -240, timeZone: 'Not/AZone' }),
    ).toBeNull();
  });

  it('returns null for missing or malformed input', () => {
    expect(zonedWallClockToMs({ time: '09:00', timeZone: NY })).toBeNull();
    expect(zonedWallClockToMs({ date: '2026-07-15', timeZone: NY })).toBeNull();
    expect(zonedWallClockToMs({ date: '2026-07-15', time: 'noon', timeZone: NY })).toBeNull();
    expect(zonedWallClockToMs({ date: 'not-a-date', time: '09:00', timeZone: NY })).toBeNull();
  });

  it('refuses out-of-range components rather than rolling them over', () => {
    expect(zonedWallClockToMs({ date: '2026-13-01', time: '09:00', timeZone: NY })).toBeNull();
    expect(zonedWallClockToMs({ date: '2026-02-30', time: '09:00', timeZone: NY })).toBeNull();
    expect(zonedWallClockToMs({ date: '2026-07-15', time: '99:99', timeZone: NY })).toBeNull();
  });

  it('accepts an unpadded date rather than dropping it', () => {
    expect(zonedWallClockToMs({ date: '2026-6-1', time: '09:00', timeZone: NY })?.ms).toEqual(
      zonedWallClockToMs({ date: '2026-06-01', time: '09:00', timeZone: NY })?.ms,
    );
  });

  it('round-trips a wall clock through both directions on both sides of the change', () => {
    for (const date of ['2026-01-15', '2026-07-15']) {
      const ms = zonedWallClockToMs({ date, time: '09:00', timeZone: NY })!.ms;
      expect(zonedParts({ ms, timeZone: NY })).toEqual({ date, time: '09:00', source: 'zone' });
    }
  });
});

describe('zonedParts', () => {
  it('reports the venue-local clock per instant', () => {
    expect(zonedParts({ ms: WINTER, timeZone: NY })).toEqual({ date: '2026-01-15', time: '07:00', source: 'zone' });
    expect(zonedParts({ ms: SUMMER, timeZone: NY })).toEqual({ date: '2026-07-15', time: '08:00', source: 'zone' });
  });

  it('uses the fixed offset when no zone is supplied, and says so', () => {
    expect(zonedParts({ ms: SUMMER, utcOffsetMinutes: -300 })).toEqual({
      date: '2026-07-15',
      time: '07:00',
      source: 'offset',
    });
  });

  it('REFUSES an unrecognised zone, and a non-finite instant', () => {
    expect(zonedParts({ ms: SUMMER, utcOffsetMinutes: -300, timeZone: 'Not/AZone' })).toBeNull();
    expect(zonedParts({ ms: Number.NaN, timeZone: NY })).toBeNull();
  });

  it('rolls the calendar day when the offset crosses midnight', () => {
    const ms = Date.parse('2026-07-16T02:00:00.000Z');
    expect(zonedParts({ ms, timeZone: NY })).toEqual({ date: '2026-07-15', time: '22:00', source: 'zone' });
  });
});

describe('the public timeZone surface delegates rather than duplicating', () => {
  it('routes validity checks through isZone', () => {
    // Identity is not assertable through a wrapper, so assert equivalence over
    // the inputs that separate the two implementations. A second copy of the
    // arithmetic would have to reproduce all of these to stay hidden.
    for (const candidate of [NY, 'UTC', 'Not/AZone', '', 'Europe/London', 'Asia/Kolkata']) {
      expect(isValidIANATimeZone(candidate)).toEqual(isZone(candidate));
    }
  });

  it('routes offset reads through offsetMinutesAt, including the failures', () => {
    expect(getTimeZoneOffsetMinutes(NY, new Date(SUMMER))).toEqual(offsetMinutesAt(SUMMER, NY));
    expect(getTimeZoneOffsetMinutes(NY, new Date(WINTER))).toEqual(offsetMinutesAt(WINTER, NY));
    // Previously a RangeError, and previously the HOST machine's offset.
    expect(getTimeZoneOffsetMinutes('Not/AZone')).toBeUndefined();
    expect(getTimeZoneOffsetMinutes(undefined as any)).toBeUndefined();
  });
});
