/**
 * Capacity Curve Tests
 *
 * Test suite for the capacity curve module that generates time-series views
 * of court capacity, computes statistics, filters, samples, and compares curves.
 *
 * INVERTED PARADIGM: Courts default to AVAILABLE; blocks paint what is UNAVAILABLE.
 * - courtsAvailable = truly open courts
 * - courtsSoftBlocked = RESERVED, SOFT_BLOCK, BLOCKED, PRACTICE, MAINTENANCE, CLOSED
 * - courtsHardBlocked = SCHEDULED, HARD_BLOCK, LOCKED
 * - UNSPECIFIED = not counted (gray fog)
 */

import { describe, it, expect } from 'vitest';
import {
  generateCapacityCurve,
  calculateCapacityStats,
  filterCapacityCurve,
  sampleCapacityCurve,
  compareCapacityCurves,
} from '@Assemblies/governors/availabilityGovernor/capacityCurve';
import {
  BLOCK_TYPES,
  type VenueDayTimeline,
  type RailSegment,
  type BlockType,
  type CourtRef,
} from '@Assemblies/governors/availabilityGovernor/types';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

const TEST_TOURNAMENT = 'test-tournament';
const TEST_VENUE = 'venue-1';
const TEST_DAY = '2026-06-15';

const mockCourt1: CourtRef = { tournamentId: TEST_TOURNAMENT, venueId: TEST_VENUE, courtId: 'court-1' };
const mockCourt2: CourtRef = { tournamentId: TEST_TOURNAMENT, venueId: TEST_VENUE, courtId: 'court-2' };
// court-3 reserved for future multi-court tests

function createSegment(start: string, end: string, status: BlockType): RailSegment {
  return { start, end, status, contributingBlocks: [] };
}

/**
 * Build a VenueDayTimeline for a single court with the given segments.
 */
function createTimeline(court: CourtRef, segments: RailSegment[]): VenueDayTimeline {
  return {
    day: TEST_DAY,
    venueId: TEST_VENUE,
    rails: [{ court, segments }],
  };
}

/**
 * Build a VenueDayTimeline containing multiple courts (one rail per court).
 */
function createMultiCourtTimeline(entries: { court: CourtRef; segments: RailSegment[] }[]): VenueDayTimeline {
  return {
    day: TEST_DAY,
    venueId: TEST_VENUE,
    rails: entries.map(({ court, segments }) => ({ court, segments })),
  };
}

// Convenient time strings
const T08 = '2026-06-15T08:00:00';
const T09 = '2026-06-15T09:00:00';
const T10 = '2026-06-15T10:00:00';
const T11 = '2026-06-15T11:00:00';
const T12 = '2026-06-15T12:00:00';
const T13 = '2026-06-15T13:00:00';
const T14 = '2026-06-15T14:00:00';
const T16 = '2026-06-15T16:00:00';
const T18 = '2026-06-15T18:00:00';

// ============================================================================
// generateCapacityCurve Tests
// ============================================================================

describe('generateCapacityCurve', () => {
  it('should return empty points for empty timelines', () => {
    const curve = generateCapacityCurve(TEST_DAY, []);
    expect(curve.day).toBe(TEST_DAY);
    expect(curve.points).toHaveLength(0);
  });

  it('should return empty points when timelines have no rails', () => {
    const timeline: VenueDayTimeline = { day: TEST_DAY, venueId: TEST_VENUE, rails: [] };
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    expect(curve.points).toHaveLength(0);
  });

  it('should show 1 available for a single court that is all AVAILABLE', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T18, BLOCK_TYPES.AVAILABLE)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);

    // Two time points: start and end of the segment
    expect(curve.points).toHaveLength(2);

    // At T08 (start), the segment [T08, T18) contains T08 so court is available
    const pointAtStart = curve.points.find((p) => p.time === T08);
    expect(pointAtStart).toBeDefined();
    expect(pointAtStart!.courtsAvailable).toBe(1);
    expect(pointAtStart!.courtsSoftBlocked).toBe(0);
    expect(pointAtStart!.courtsHardBlocked).toBe(0);
  });

  it('should count correctly with two courts, one AVAILABLE and one BLOCKED', () => {
    const timeline = createMultiCourtTimeline([
      { court: mockCourt1, segments: [createSegment(T08, T18, BLOCK_TYPES.AVAILABLE)] },
      { court: mockCourt2, segments: [createSegment(T08, T18, BLOCK_TYPES.BLOCKED)] },
    ]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);

    const pointAtStart = curve.points.find((p) => p.time === T08);
    expect(pointAtStart).toBeDefined();
    expect(pointAtStart!.courtsAvailable).toBe(1);
    expect(pointAtStart!.courtsSoftBlocked).toBe(1); // BLOCKED -> softBlocked
    expect(pointAtStart!.courtsHardBlocked).toBe(0);
  });

  // -------------------------------------------------------------------
  // Status categorization tests
  // -------------------------------------------------------------------

  it('should categorize AVAILABLE to courtsAvailable', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.AVAILABLE)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsAvailable).toBe(1);
    expect(p.courtsSoftBlocked).toBe(0);
    expect(p.courtsHardBlocked).toBe(0);
  });

  it('should categorize RESERVED to courtsSoftBlocked', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.RESERVED)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsSoftBlocked).toBe(1);
  });

  it('should categorize SOFT_BLOCK to courtsSoftBlocked', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.SOFT_BLOCK)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsSoftBlocked).toBe(1);
  });

  it('should categorize BLOCKED to courtsSoftBlocked', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.BLOCKED)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsSoftBlocked).toBe(1);
  });

  it('should categorize PRACTICE to courtsSoftBlocked', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.PRACTICE)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsSoftBlocked).toBe(1);
  });

  it('should categorize MAINTENANCE to courtsSoftBlocked', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.MAINTENANCE)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsSoftBlocked).toBe(1);
  });

  it('should categorize CLOSED to courtsSoftBlocked', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.CLOSED)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsSoftBlocked).toBe(1);
  });

  it('should categorize SCHEDULED to courtsHardBlocked', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.SCHEDULED)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsHardBlocked).toBe(1);
  });

  it('should categorize HARD_BLOCK to courtsHardBlocked', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.HARD_BLOCK)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsHardBlocked).toBe(1);
  });

  it('should categorize LOCKED to courtsHardBlocked', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.LOCKED)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsHardBlocked).toBe(1);
  });

  it('should not count UNSPECIFIED in any bucket', () => {
    const timeline = createTimeline(mockCourt1, [createSegment(T08, T10, BLOCK_TYPES.UNSPECIFIED)]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);
    const p = curve.points.find((pt) => pt.time === T08)!;
    expect(p.courtsAvailable).toBe(0);
    expect(p.courtsSoftBlocked).toBe(0);
    expect(p.courtsHardBlocked).toBe(0);
  });

  // -------------------------------------------------------------------
  // Time point collection and sorting
  // -------------------------------------------------------------------

  it('should collect all unique time points from segments', () => {
    const timeline = createMultiCourtTimeline([
      {
        court: mockCourt1,
        segments: [createSegment(T08, T10, BLOCK_TYPES.AVAILABLE), createSegment(T10, T12, BLOCK_TYPES.MAINTENANCE)],
      },
      {
        court: mockCourt2,
        segments: [createSegment(T09, T11, BLOCK_TYPES.AVAILABLE), createSegment(T11, T13, BLOCK_TYPES.PRACTICE)],
      },
    ]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);

    const times = curve.points.map((p) => p.time);
    // Unique times: T08, T09, T10, T11, T12, T13
    expect(times).toContain(T08);
    expect(times).toContain(T09);
    expect(times).toContain(T10);
    expect(times).toContain(T11);
    expect(times).toContain(T12);
    expect(times).toContain(T13);
    expect(times).toHaveLength(6);
  });

  it('should return time points in sorted order', () => {
    // Use segments whose start/end are not in natural order across courts
    const timeline = createMultiCourtTimeline([
      { court: mockCourt1, segments: [createSegment(T14, T18, BLOCK_TYPES.AVAILABLE)] },
      { court: mockCourt2, segments: [createSegment(T08, T12, BLOCK_TYPES.AVAILABLE)] },
    ]);
    const curve = generateCapacityCurve(TEST_DAY, [timeline]);

    const times = curve.points.map((p) => p.time);
    const sorted = [...times].sort();
    expect(times).toEqual(sorted);
  });
});

// ============================================================================
// calculateCapacityStats Tests
// ============================================================================

describe('calculateCapacityStats', () => {
  it('should return zeroes for an empty curve', () => {
    const stats = calculateCapacityStats({ day: TEST_DAY, points: [] });
    expect(stats.peakAvailable).toBe(0);
    expect(stats.peakTime).toBe('');
    expect(stats.minAvailable).toBe(0);
    expect(stats.minTime).toBe('');
    expect(stats.avgAvailable).toBe(0);
    expect(stats.totalCourtHours).toBe(0);
    expect(stats.utilizationPercent).toBe(0);
    expect(stats.peakUnavailable).toBe(0);
    expect(stats.peakUnavailableTime).toBe('');
    expect(stats.totalCourts).toBe(0);
    expect(stats.totalAvailableHours).toBe(0);
    expect(stats.totalUnavailableHours).toBe(0);
    expect(stats.availablePercent).toBe(0);
    expect(stats.avgBlockedHoursPerCourt).toBe(0);
  });

  it('should compute correct stats for single constant availability', () => {
    // 2 courts available, 0 blocked, from 08:00 to 12:00 (4 hours)
    const curve = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
        { time: T12, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      ],
    };
    const stats = calculateCapacityStats(curve);

    expect(stats.peakAvailable).toBe(2);
    expect(stats.peakTime).toBe(T08);
    expect(stats.minAvailable).toBe(2);
    expect(stats.minTime).toBe(T08);
    expect(stats.avgAvailable).toBe(2); // Only first point counted for avg (length-1 = 1)
  });

  it('should find correct peak and min times with varying availability', () => {
    const curve = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 3, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
        { time: T10, courtsAvailable: 1, courtsSoftBlocked: 2, courtsHardBlocked: 0 },
        { time: T12, courtsAvailable: 5, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
        { time: T14, courtsAvailable: 2, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
        { time: T16, courtsAvailable: 2, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
      ],
    };
    const stats = calculateCapacityStats(curve);

    expect(stats.peakAvailable).toBe(5);
    expect(stats.peakTime).toBe(T12);
    expect(stats.minAvailable).toBe(1);
    expect(stats.minTime).toBe(T10);
  });

  it('should calculate totalCourtHours correctly', () => {
    // maxTotalCourts=3 at every point, day span 08:00->12:00 = 4 hours
    // totalCourtHours = maxTotalCourts * dayDuration = 3 * 4 = 12
    const curve = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 2, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
        { time: T10, courtsAvailable: 1, courtsSoftBlocked: 1, courtsHardBlocked: 1 },
        { time: T12, courtsAvailable: 3, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      ],
    };
    const stats = calculateCapacityStats(curve);

    // Day span = T08 to T12 = 4 hours. Max total courts = max(3, 3, 3) = 3.
    // totalCourtHours = 3 * 4 = 12
    expect(stats.totalCourtHours).toBe(12);
    expect(stats.totalCourts).toBe(3);
  });

  it('should calculate utilizationPercent (% blocked) correctly', () => {
    // 2 courts, 08:00-10:00 (2 hours): 1 available, 1 soft blocked
    // Then 10:00-12:00 (2 hours): 2 available, 0 blocked
    // Total possible = 2 courts * 4 hours = 8 court-hours
    // Total unavailable = 1 court * 2 hours = 2 court-hours
    // utilization% = 2/8 * 100 = 25%
    const curve = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 1, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
        { time: T10, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
        { time: T12, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      ],
    };
    const stats = calculateCapacityStats(curve);

    expect(stats.utilizationPercent).toBe(25);
  });

  it('should calculate availablePercent correctly', () => {
    // Same scenario as above
    // Total available hours = 1*2 + 2*2 = 6
    // Total possible = 8
    // availablePercent = 6/8 * 100 = 75%
    const curve = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 1, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
        { time: T10, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
        { time: T12, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      ],
    };
    const stats = calculateCapacityStats(curve);

    expect(stats.availablePercent).toBe(75);
  });

  it('should track peakUnavailable correctly', () => {
    const curve = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 3, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
        { time: T10, courtsAvailable: 1, courtsSoftBlocked: 2, courtsHardBlocked: 1 },
        { time: T12, courtsAvailable: 4, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
        { time: T14, courtsAvailable: 4, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      ],
    };
    const stats = calculateCapacityStats(curve);

    // At T10: softBlocked=2 + hardBlocked=1 = 3 unavailable
    expect(stats.peakUnavailable).toBe(3);
    expect(stats.peakUnavailableTime).toBe(T10);
  });

  it('should calculate avgBlockedHoursPerCourt correctly', () => {
    // 2 courts, 08:00-12:00 (4 hours)
    // 08:00-10:00: 1 available, 1 soft blocked -> 1 unavailable * 2h = 2 unavail-hours
    // 10:00-12:00: 2 available -> 0 unavailable * 2h = 0 unavail-hours
    // totalUnavailableHours = 2
    // maxTotalCourts = 2
    // avgBlockedHoursPerCourt = 2 / 2 = 1
    const curve = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 1, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
        { time: T10, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
        { time: T12, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      ],
    };
    const stats = calculateCapacityStats(curve);

    expect(stats.avgBlockedHoursPerCourt).toBe(1);
  });
});

// ============================================================================
// filterCapacityCurve Tests
// ============================================================================

describe('filterCapacityCurve', () => {
  const baseCurve = {
    day: TEST_DAY,
    points: [
      { time: T08, courtsAvailable: 3, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      { time: T10, courtsAvailable: 2, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
      { time: T12, courtsAvailable: 1, courtsSoftBlocked: 1, courtsHardBlocked: 1 },
      { time: T14, courtsAvailable: 3, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      { time: T16, courtsAvailable: 3, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
    ],
  };

  it('should filter to a time range inclusively', () => {
    const filtered = filterCapacityCurve(baseCurve, { start: T10, end: T14 });

    expect(filtered.day).toBe(TEST_DAY);
    expect(filtered.points).toHaveLength(3); // T10, T12, T14
    expect(filtered.points[0].time).toBe(T10);
    expect(filtered.points[1].time).toBe(T12);
    expect(filtered.points[2].time).toBe(T14);
  });

  it('should return empty points when range excludes all points', () => {
    const filtered = filterCapacityCurve(baseCurve, {
      start: '2026-06-15T20:00:00',
      end: '2026-06-15T22:00:00',
    });

    expect(filtered.points).toHaveLength(0);
    expect(filtered.day).toBe(TEST_DAY);
  });
});

// ============================================================================
// sampleCapacityCurve Tests
// ============================================================================

describe('sampleCapacityCurve', () => {
  it('should return the same curve for empty points', () => {
    const empty = { day: TEST_DAY, points: [] };
    const sampled = sampleCapacityCurve(empty, 60);
    expect(sampled.points).toHaveLength(0);
  });

  it('should sample at regular intervals', () => {
    // Curve spans 08:00 - 12:00 (4 hours). Sample every 60 minutes -> 5 samples
    const curve = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
        { time: T12, courtsAvailable: 4, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      ],
    };
    const sampled = sampleCapacityCurve(curve, 60);

    // 08:00, 09:00, 10:00, 11:00, 12:00 -> 5 samples
    expect(sampled.points).toHaveLength(5);
    expect(sampled.points[0].time).toBe(new Date(T08).toISOString());
    expect(sampled.points[4].time).toBe(new Date(T12).toISOString());
  });

  it('should interpolate capacity at sample points using step-wise (last known) interpolation', () => {
    // Use UTC-aware ISO strings so sampleCapacityCurve's toISOString() comparisons
    // align with the point times (new Date('...Z').toISOString() round-trips cleanly).
    const U08 = '2026-06-15T08:00:00.000Z';
    const U10 = '2026-06-15T10:00:00.000Z';
    const U12 = '2026-06-15T12:00:00.000Z';

    const curve = {
      day: TEST_DAY,
      points: [
        { time: U08, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
        { time: U10, courtsAvailable: 4, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
        { time: U12, courtsAvailable: 4, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
      ],
    };
    const sampled = sampleCapacityCurve(curve, 60);

    // At 09:00 UTC (between U08 and U10): step-wise interpolation uses U08 values
    const U09 = '2026-06-15T09:00:00.000Z';
    const at09 = sampled.points.find((p) => p.time === U09);
    expect(at09).toBeDefined();
    expect(at09!.courtsAvailable).toBe(2);
    expect(at09!.courtsSoftBlocked).toBe(0);

    // At 11:00 UTC (between U10 and U12): step-wise interpolation uses U10 values
    const U11 = '2026-06-15T11:00:00.000Z';
    const at11 = sampled.points.find((p) => p.time === U11);
    expect(at11).toBeDefined();
    expect(at11!.courtsAvailable).toBe(4);
    expect(at11!.courtsSoftBlocked).toBe(1);
  });
});

// ============================================================================
// compareCapacityCurves Tests
// ============================================================================

describe('compareCapacityCurves', () => {
  it('should return all-zero deltas for identical curves', () => {
    const curve = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 3, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
        { time: T10, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 1 },
        { time: T12, courtsAvailable: 3, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      ],
    };
    const diffs = compareCapacityCurves(curve, curve);

    expect(diffs).toHaveLength(3);
    for (const diff of diffs) {
      expect(diff.availableDelta).toBe(0);
      expect(diff.softBlockedDelta).toBe(0);
      expect(diff.hardBlockedDelta).toBe(0);
    }
  });

  it('should show positive availableDelta when availability is added', () => {
    const baseline = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 2, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
        { time: T12, courtsAvailable: 2, courtsSoftBlocked: 1, courtsHardBlocked: 0 },
      ],
    };
    const modified = {
      day: TEST_DAY,
      points: [
        { time: T08, courtsAvailable: 4, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
        { time: T12, courtsAvailable: 4, courtsSoftBlocked: 0, courtsHardBlocked: 0 },
      ],
    };
    const diffs = compareCapacityCurves(baseline, modified);

    expect(diffs).toHaveLength(2);
    expect(diffs[0].availableDelta).toBe(2); // 4 - 2
    expect(diffs[0].softBlockedDelta).toBe(-1); // 0 - 1
  });

  it('should show positive softBlockedDelta when soft blocking is added', () => {
    const baseline = {
      day: TEST_DAY,
      points: [{ time: T08, courtsAvailable: 4, courtsSoftBlocked: 0, courtsHardBlocked: 0 }],
    };
    const modified = {
      day: TEST_DAY,
      points: [{ time: T08, courtsAvailable: 2, courtsSoftBlocked: 2, courtsHardBlocked: 0 }],
    };
    const diffs = compareCapacityCurves(baseline, modified);

    expect(diffs[0].softBlockedDelta).toBe(2);
    expect(diffs[0].availableDelta).toBe(-2);
  });

  it('should show positive hardBlockedDelta when hard blocking is added', () => {
    const baseline = {
      day: TEST_DAY,
      points: [{ time: T10, courtsAvailable: 3, courtsSoftBlocked: 0, courtsHardBlocked: 0 }],
    };
    const modified = {
      day: TEST_DAY,
      points: [{ time: T10, courtsAvailable: 1, courtsSoftBlocked: 0, courtsHardBlocked: 2 }],
    };
    const diffs = compareCapacityCurves(baseline, modified);

    expect(diffs[0].hardBlockedDelta).toBe(2);
    expect(diffs[0].availableDelta).toBe(-2);
  });

  it('should handle different time points by defaulting missing points to zero', () => {
    const baseline = {
      day: TEST_DAY,
      points: [{ time: T08, courtsAvailable: 2, courtsSoftBlocked: 0, courtsHardBlocked: 0 }],
    };
    const modified = {
      day: TEST_DAY,
      points: [{ time: T10, courtsAvailable: 3, courtsSoftBlocked: 0, courtsHardBlocked: 0 }],
    };
    const diffs = compareCapacityCurves(baseline, modified);

    // Should have 2 time points: T08 and T10
    expect(diffs).toHaveLength(2);

    // At T08: baseline has data, modified defaults to 0
    const diffAtT08 = diffs.find((d) => d.time === T08)!;
    expect(diffAtT08.availableDelta).toBe(-2); // 0 - 2

    // At T10: baseline defaults to 0, modified has data
    const diffAtT10 = diffs.find((d) => d.time === T10)!;
    expect(diffAtT10.availableDelta).toBe(3); // 3 - 0
  });
});
