/**
 * Time Granularity Tests
 *
 * Tests for canonical time granularity utilities:
 * snap-to-granularity, HH:MM conversion, day tick iteration.
 */

import { describe, it, expect } from 'vitest';
import {
  hhmmToMinutes,
  minutesToHhmm,
  snapToGranularity,
  snapIsoToGranularity,
  iterateDayTicks,
} from '@Assemblies/governors/availabilityGovernor/timeGranularity';
import { AvailabilityEngine } from '@Assemblies/engines/availability/AvailabilityEngine';

// ============================================================================
// hhmmToMinutes / minutesToHhmm
// ============================================================================

describe('hhmmToMinutes', () => {
  it('converts midnight', () => {
    expect(hhmmToMinutes('00:00')).toBe(0);
  });

  it('converts common times', () => {
    expect(hhmmToMinutes('06:00')).toBe(360);
    expect(hhmmToMinutes('12:00')).toBe(720);
    expect(hhmmToMinutes('23:00')).toBe(1380);
    expect(hhmmToMinutes('23:59')).toBe(1439);
  });

  it('handles quarter-hour times', () => {
    expect(hhmmToMinutes('08:15')).toBe(495);
    expect(hhmmToMinutes('08:30')).toBe(510);
    expect(hhmmToMinutes('08:45')).toBe(525);
  });
});

describe('minutesToHhmm', () => {
  it('converts 0 to midnight', () => {
    expect(minutesToHhmm(0)).toBe('00:00');
  });

  it('converts common values', () => {
    expect(minutesToHhmm(360)).toBe('06:00');
    expect(minutesToHhmm(720)).toBe('12:00');
    expect(minutesToHhmm(1380)).toBe('23:00');
    expect(minutesToHhmm(1439)).toBe('23:59');
  });

  it('pads single-digit hours and minutes', () => {
    expect(minutesToHhmm(65)).toBe('01:05');
    expect(minutesToHhmm(9)).toBe('00:09');
  });

  it('clamps negative values to 00:00', () => {
    expect(minutesToHhmm(-10)).toBe('00:00');
  });

  it('clamps values exceeding 23:59', () => {
    expect(minutesToHhmm(1500)).toBe('23:59');
  });

  it('rounds fractional values', () => {
    expect(minutesToHhmm(60.4)).toBe('01:00');
    expect(minutesToHhmm(60.6)).toBe('01:01');
  });
});

// ============================================================================
// snapToGranularity
// ============================================================================

describe('snapToGranularity', () => {
  describe('floor mode', () => {
    it('snaps down to 15-minute boundary', () => {
      expect(snapToGranularity(607, 15, 'floor')).toBe(600); // 10:07 -> 10:00
      expect(snapToGranularity(614, 15, 'floor')).toBe(600); // 10:14 -> 10:00
      expect(snapToGranularity(615, 15, 'floor')).toBe(615); // 10:15 -> 10:15
    });

    it('snaps down to 30-minute boundary', () => {
      expect(snapToGranularity(607, 30, 'floor')).toBe(600); // 10:07 -> 10:00
      expect(snapToGranularity(629, 30, 'floor')).toBe(600); // 10:29 -> 10:00
      expect(snapToGranularity(630, 30, 'floor')).toBe(630); // 10:30 -> 10:30
    });
  });

  describe('ceil mode', () => {
    it('snaps up to 15-minute boundary', () => {
      expect(snapToGranularity(601, 15, 'ceil')).toBe(615); // 10:01 -> 10:15
      expect(snapToGranularity(615, 15, 'ceil')).toBe(615); // 10:15 -> 10:15 (already on boundary)
    });

    it('snaps up to 30-minute boundary', () => {
      expect(snapToGranularity(601, 30, 'ceil')).toBe(630); // 10:01 -> 10:30
      expect(snapToGranularity(630, 30, 'ceil')).toBe(630); // 10:30 -> 10:30
    });
  });

  describe('round mode (default)', () => {
    it('rounds to nearest 15-minute boundary', () => {
      expect(snapToGranularity(607, 15)).toBe(600); // 10:07 -> 10:00 (closer)
      expect(snapToGranularity(608, 15)).toBe(615); // 10:08 -> 10:15 (closer)
    });

    it('rounds to nearest 30-minute boundary', () => {
      expect(snapToGranularity(614, 30)).toBe(600); // 10:14 -> 10:00
      expect(snapToGranularity(616, 30)).toBe(630); // 10:16 -> 10:30
    });
  });

  it('returns input unchanged when granularity is 0', () => {
    expect(snapToGranularity(607, 0)).toBe(607);
  });

  it('returns input unchanged when granularity is negative', () => {
    expect(snapToGranularity(607, -5)).toBe(607);
  });

  it('handles exact boundary values', () => {
    expect(snapToGranularity(600, 15, 'floor')).toBe(600);
    expect(snapToGranularity(600, 15, 'ceil')).toBe(600);
    expect(snapToGranularity(600, 15, 'round')).toBe(600);
  });
});

// ============================================================================
// snapIsoToGranularity
// ============================================================================

describe('snapIsoToGranularity', () => {
  it('snaps ISO datetime to 15-minute floor', () => {
    expect(snapIsoToGranularity('2026-06-15T10:07:00', 15, 'floor')).toBe('2026-06-15T10:00:00');
  });

  it('snaps ISO datetime to 15-minute ceil', () => {
    expect(snapIsoToGranularity('2026-06-15T10:07:00', 15, 'ceil')).toBe('2026-06-15T10:15:00');
  });

  it('snaps ISO datetime to 30-minute round', () => {
    expect(snapIsoToGranularity('2026-06-15T10:14:00', 30, 'round')).toBe('2026-06-15T10:00:00');
    expect(snapIsoToGranularity('2026-06-15T10:16:00', 30, 'round')).toBe('2026-06-15T10:30:00');
  });

  it('preserves date portion', () => {
    const result = snapIsoToGranularity('2026-12-31T23:45:00', 15, 'floor');
    expect(result).toBe('2026-12-31T23:45:00');
  });

  it('defaults to round mode', () => {
    expect(snapIsoToGranularity('2026-06-15T10:08:00', 15)).toBe('2026-06-15T10:15:00');
  });
});

// ============================================================================
// iterateDayTicks
// ============================================================================

describe('iterateDayTicks', () => {
  it('generates 15-minute ticks for a range', () => {
    const ticks = [...iterateDayTicks('08:00', '09:00', 15)];
    expect(ticks).toEqual(['08:00', '08:15', '08:30', '08:45']);
  });

  it('generates 30-minute ticks', () => {
    const ticks = [...iterateDayTicks('10:00', '12:00', 30)];
    expect(ticks).toEqual(['10:00', '10:30', '11:00', '11:30']);
  });

  it('generates hourly ticks', () => {
    const ticks = [...iterateDayTicks('06:00', '10:00', 60)];
    expect(ticks).toEqual(['06:00', '07:00', '08:00', '09:00']);
  });

  it('returns empty for invalid granularity', () => {
    expect([...iterateDayTicks('08:00', '09:00', 0)]).toEqual([]);
    expect([...iterateDayTicks('08:00', '09:00', -15)]).toEqual([]);
  });

  it('returns empty when start >= end', () => {
    expect([...iterateDayTicks('10:00', '10:00', 15)]).toEqual([]);
    expect([...iterateDayTicks('12:00', '10:00', 15)]).toEqual([]);
  });

  it('excludes end time', () => {
    const ticks = [...iterateDayTicks('08:00', '08:15', 15)];
    expect(ticks).toEqual(['08:00']);
    expect(ticks).not.toContain('08:15');
  });

  it('handles full day', () => {
    const ticks = [...iterateDayTicks('00:00', '24:00', 60)];
    // 00:00 through 23:00 = 24 ticks
    expect(ticks).toHaveLength(24);
    expect(ticks[0]).toBe('00:00');
    expect(ticks[23]).toBe('23:00');
  });
});

// ============================================================================
// Engine Integration: getResolvedGranularityMinutes
// ============================================================================

describe('AvailabilityEngine granularity resolution', () => {
  const basicRecord = {
    tournamentId: 'test-tournament',
    startDate: '2026-06-15',
    endDate: '2026-06-17',
    venues: [{ venueId: 'venue-1', courts: [{ courtId: 'court-1' }] }],
  };

  it('defaults to slotMinutes (15) when no granularityMinutes set', () => {
    const engine = new AvailabilityEngine();
    engine.init(basicRecord);
    expect(engine.getResolvedGranularityMinutes()).toBe(15);
  });

  it('uses explicit slotMinutes when granularityMinutes not set', () => {
    const engine = new AvailabilityEngine();
    engine.init(basicRecord, { slotMinutes: 10 });
    expect(engine.getResolvedGranularityMinutes()).toBe(10);
  });

  it('uses granularityMinutes over slotMinutes when both set', () => {
    const engine = new AvailabilityEngine();
    engine.init(basicRecord, { slotMinutes: 15, granularityMinutes: 30 });
    expect(engine.getResolvedGranularityMinutes()).toBe(30);
  });

  it('uses granularityMinutes when only it is set', () => {
    const engine = new AvailabilityEngine();
    engine.init(basicRecord, { granularityMinutes: 60 });
    expect(engine.getResolvedGranularityMinutes()).toBe(60);
  });
});
