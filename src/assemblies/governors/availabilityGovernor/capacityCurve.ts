/**
 * Capacity Curve Generation
 *
 * Generates time-series views of court capacity showing how many courts
 * are available, soft-blocked, or hard-blocked at each point in time.
 *
 * This provides the "capacity stream" view that is central to the
 * temporal grid's philosophy.
 */

import {
  BLOCK_TYPES,
  type CapacityCurve,
  type CapacityPoint,
  type DayId,
  type VenueDayTimeline,
  type RailSegment,
} from './types';

// ============================================================================
// Capacity Point Extraction
// ============================================================================

/**
 * Generate capacity points from facility day timelines.
 * Creates a time-series showing court counts by status.
 *
 * Algorithm:
 * 1. Collect all unique time points from segments across all courts
 * 2. For each time point, count courts by status
 * 3. Return sorted capacity points
 */
export function generateCapacityCurve(day: DayId, timelines: VenueDayTimeline[]): CapacityCurve {
  // Collect all unique time points
  const timePoints = new Set<string>();

  if (!Array.isArray(timelines)) {
    return {
      day,
      points: [],
    };
  }

  for (const timeline of timelines) {
    for (const rail of timeline.rails) {
      for (const segment of rail.segments) {
        timePoints.add(segment.start);
        timePoints.add(segment.end);
      }
    }
  }

  // Sort time points
  const sortedTimes = Array.from(timePoints).sort();

  // For each time point, count courts by status
  const points: CapacityPoint[] = sortedTimes.map((time) => {
    return {
      time,
      courtsAvailable: 0,
      courtsSoftBlocked: 0,
      courtsHardBlocked: 0,
    };
  });

  // Count courts at each point
  for (const timeline of timelines) {
    for (const rail of timeline.rails) {
      for (let i = 0; i < sortedTimes.length; i++) {
        const time = sortedTimes[i];
        const segment = findSegmentAtTime(rail.segments, time);

        if (segment) {
          const point = points[i];
          categorizeSegment(segment, point);
        }
      }
    }
  }

  return {
    day,
    points,
  };
}

/**
 * Find the segment that contains a given time point
 */
function findSegmentAtTime(segments: RailSegment[], time: string): RailSegment | null {
  for (const segment of segments) {
    if (time >= segment.start && time < segment.end) {
      return segment;
    }
  }
  return null;
}

/**
 * Categorize a segment and increment appropriate counter
 *
 * INVERTED PARADIGM: We count UNAVAILABLE courts (blocked/in-use)
 * - courtsAvailable = courts that are NOT blocked (truly available)
 * - courtsSoftBlocked = courts blocked for maintenance, practice, etc.
 * - courtsHardBlocked = courts hard-blocked or locked
 */
function categorizeSegment(segment: RailSegment, point: CapacityPoint): void {
  switch (segment.status) {
    case BLOCK_TYPES.AVAILABLE:
      // Truly available - not blocked at all
      point.courtsAvailable++;
      break;

    case BLOCK_TYPES.RESERVED:
    case BLOCK_TYPES.SOFT_BLOCK:
      // Reserved for players but still "soft" (can be overridden)
      point.courtsSoftBlocked++;
      break;

    case BLOCK_TYPES.BLOCKED:
    case BLOCK_TYPES.PRACTICE:
    case BLOCK_TYPES.MAINTENANCE:
    case BLOCK_TYPES.CLOSED:
      // Unavailable - blocked for various reasons
      point.courtsSoftBlocked++;
      break;

    case BLOCK_TYPES.SCHEDULED:
    case BLOCK_TYPES.HARD_BLOCK:
    case BLOCK_TYPES.LOCKED:
      // Hard unavailable - scheduled matches, locked
      point.courtsHardBlocked++;
      break;

    case BLOCK_TYPES.UNSPECIFIED:
      // Don't count unspecified - it's "gray fog"
      break;
  }
}

// ============================================================================
// Capacity Statistics
// ============================================================================

/**
 * Calculate capacity statistics for a curve
 *
 * INVERTED PARADIGM METRICS:
 * - peakUnavailable: Maximum number of courts blocked at any point (Peak Use)
 * - avgBlockedHoursPerCourt: Average hours blocked per court
 * - availablePercent: Percentage of total court-hours that are AVAILABLE
 * - utilizationPercent: Percentage of total court-hours that are UNAVAILABLE (in use)
 */
export interface CapacityStats {
  peakAvailable: number; // Legacy - max courts available at once
  peakTime: string;
  minAvailable: number; // Legacy - min courts available at once
  minTime: string;
  avgAvailable: number; // Legacy - kept for backward compatibility
  totalCourtHours: number;
  utilizationPercent: number; // NEW: % of time blocked (inverted)
  // New metrics for inverted paradigm
  peakUnavailable?: number; // Peak number of courts blocked at once
  peakUnavailableTime?: string;
  totalCourts?: number; // Total number of courts
  totalAvailableHours?: number; // Total court-hours available
  totalUnavailableHours?: number; // Total court-hours unavailable
  availablePercent?: number; // % of court-hours available
  avgBlockedHoursPerCourt?: number; // Average hours blocked per court
}

export function calculateCapacityStats(curve: CapacityCurve): CapacityStats {
  if (!curve.points || curve.points.length === 0) {
    return {
      peakAvailable: 0,
      peakTime: '',
      minAvailable: 0,
      minTime: '',
      avgAvailable: 0,
      totalCourtHours: 0,
      utilizationPercent: 0,
      peakUnavailable: 0,
      peakUnavailableTime: '',
      totalCourts: 0,
      totalAvailableHours: 0,
      totalUnavailableHours: 0,
      availablePercent: 0,
      avgBlockedHoursPerCourt: 0,
    };
  }

  // Legacy metrics (kept for backward compatibility)
  let peakAvailable = 0;
  let peakTime = curve.points[0].time;
  let minAvailable = Infinity;
  let minTime = curve.points[0].time;

  // NEW metrics for inverted paradigm
  let peakUnavailable = 0;
  let peakUnavailableTime = curve.points[0].time;
  let totalAvailableHours = 0;
  let totalUnavailableHours = 0;

  // Track total courts (max courts seen at any point)
  let maxTotalCourts = 0;

  for (let i = 0; i < curve.points.length - 1; i++) {
    const current = curve.points[i];
    const next = curve.points[i + 1];

    // Calculate duration for this segment
    const durationHours = (new Date(next.time).getTime() - new Date(current.time).getTime()) / (1000 * 60 * 60);

    // Count total courts at this point
    const totalCourtsNow = current.courtsAvailable + current.courtsSoftBlocked + current.courtsHardBlocked;
    maxTotalCourts = Math.max(maxTotalCourts, totalCourtsNow);

    // Count unavailable courts (blocked = soft + hard)
    const courtsUnavailable = current.courtsSoftBlocked + current.courtsHardBlocked;

    // Legacy: Track peak/min AVAILABLE
    if (current.courtsAvailable > peakAvailable) {
      peakAvailable = current.courtsAvailable;
      peakTime = current.time;
    }
    if (current.courtsAvailable < minAvailable) {
      minAvailable = current.courtsAvailable;
      minTime = current.time;
    }

    // NEW: Track peak UNAVAILABLE (Peak Use)
    if (courtsUnavailable > peakUnavailable) {
      peakUnavailable = courtsUnavailable;
      peakUnavailableTime = current.time;
    }

    // Calculate court-hours
    totalAvailableHours += current.courtsAvailable * durationHours;
    totalUnavailableHours += courtsUnavailable * durationHours;
  }

  // Total possible court-hours (all courts, full day)
  const dayDurationHours =
    (new Date(curve.points.at(-1)!.time).getTime() - new Date(curve.points[0].time).getTime()) / (1000 * 60 * 60);
  const totalPossibleCourtHours = maxTotalCourts * dayDurationHours;

  // NEW: Available % = available hours / total possible hours
  const availablePercent = totalPossibleCourtHours > 0 ? (totalAvailableHours / totalPossibleCourtHours) * 100 : 0;

  // NEW: Utilization % = unavailable hours / total possible hours (INVERTED)
  const utilizationPercent = totalPossibleCourtHours > 0 ? (totalUnavailableHours / totalPossibleCourtHours) * 100 : 0;

  // NEW: Average blocked hours per court
  const avgBlockedHoursPerCourt = maxTotalCourts > 0 ? totalUnavailableHours / maxTotalCourts : 0;

  // Legacy avgAvailable (average courts available across time samples)
  const avgAvailable =
    curve.points.length > 1
      ? curve.points.slice(0, -1).reduce((sum, p) => sum + p.courtsAvailable, 0) / (curve.points.length - 1)
      : 0;

  return {
    // Legacy metrics
    peakAvailable,
    peakTime,
    minAvailable: minAvailable === Infinity ? 0 : minAvailable,
    minTime,
    avgAvailable,
    totalCourtHours: totalPossibleCourtHours,

    // NEW inverted paradigm metrics
    utilizationPercent, // Now correctly shows % BLOCKED
    peakUnavailable, // Peak number of courts blocked at once
    peakUnavailableTime,
    totalCourts: maxTotalCourts,
    totalAvailableHours,
    totalUnavailableHours,
    availablePercent, // % of court-hours available
    avgBlockedHoursPerCourt, // Average hours blocked per court
  };
}

// ============================================================================
// Capacity Filtering
// ============================================================================

/**
 * Filter capacity curve to a specific time range
 */
export function filterCapacityCurve(curve: CapacityCurve, timeRange: { start: string; end: string }): CapacityCurve {
  const filteredPoints = curve.points?.filter((point) => point.time >= timeRange.start && point.time <= timeRange.end);

  return {
    ...curve,
    points: filteredPoints,
  };
}

/**
 * Sample capacity curve at regular intervals (for rendering)
 */
export function sampleCapacityCurve(curve: CapacityCurve, intervalMinutes: number): CapacityCurve {
  if (!curve.points || curve.points.length === 0) return curve;

  const sampledPoints: CapacityPoint[] = [];
  const startTime = new Date(curve.points[0].time);
  const endTime = new Date(curve.points.at(-1)!.time);

  let currentTime = new Date(startTime);
  while (currentTime <= endTime) {
    const timeStr = currentTime.toISOString();
    const point = interpolateCapacityAt(curve.points, timeStr);
    if (point) {
      sampledPoints.push(point);
    }

    currentTime = new Date(currentTime.getTime() + intervalMinutes * 60 * 1000);
  }

  return {
    ...curve,
    points: sampledPoints,
  };
}

/**
 * Interpolate capacity at a specific time
 */
function interpolateCapacityAt(points: CapacityPoint[], time: string): CapacityPoint | null {
  // Find the point at or immediately before this time
  for (let i = points.length - 1; i >= 0; i--) {
    if (points[i].time <= time) {
      return {
        time,
        courtsAvailable: points[i].courtsAvailable,
        courtsSoftBlocked: points[i].courtsSoftBlocked,
        courtsHardBlocked: points[i].courtsHardBlocked,
      };
    }
  }

  return null;
}

// ============================================================================
// Capacity Comparison
// ============================================================================

/**
 * Compare two capacity curves to show changes
 */
export interface CapacityDiff {
  time: string;
  availableDelta: number;
  softBlockedDelta: number;
  hardBlockedDelta: number;
}

export function compareCapacityCurves(baseline: CapacityCurve, modified: CapacityCurve): CapacityDiff[] {
  const diffs: CapacityDiff[] = [];

  // Collect all unique time points from both curves
  const allTimes = new Set<string>();
  baseline.points?.forEach((p) => allTimes.add(p.time));
  modified?.points?.forEach((p) => allTimes.add(p.time));

  const sortedTimes = Array.from(allTimes).sort();

  for (const time of sortedTimes) {
    const baselinePoint = baseline.points?.find((p) => p.time === time) || {
      time,
      courtsAvailable: 0,
      courtsSoftBlocked: 0,
      courtsHardBlocked: 0,
    };

    const modifiedPoint = modified.points?.find((p) => p.time === time) || {
      time,
      courtsAvailable: 0,
      courtsSoftBlocked: 0,
      courtsHardBlocked: 0,
    };

    diffs.push({
      time,
      availableDelta: modifiedPoint.courtsAvailable - baselinePoint.courtsAvailable,
      softBlockedDelta: modifiedPoint.courtsSoftBlocked - baselinePoint.courtsSoftBlocked,
      hardBlockedDelta: modifiedPoint.courtsHardBlocked - baselinePoint.courtsHardBlocked,
    });
  }

  return diffs;
}
