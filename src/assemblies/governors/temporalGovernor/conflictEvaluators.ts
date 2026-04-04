/**
 * Conflict Evaluators
 *
 * Pluggable conflict detection system for the Temporal Engine.
 * Evaluators inspect proposed mutations and return conflicts/warnings.
 *
 * Design:
 * - Each evaluator is independent and composable
 * - Evaluators can query engine context
 * - Returns conflicts with severity levels (INFO, WARN, ERROR)
 * - Can integrate with Competition Factory's proConflicts
 */

import { extractDate } from '@Tools/dateTime';

import { BLOCK_TYPES, type BlockMutation, type EngineConflict, type EngineContext } from './types';

import { diffMinutes, rangesOverlap } from './railDerivation';

// ============================================================================
// Court Overlap Evaluator
// ============================================================================

/**
 * Detects overlapping blocks on the same court.
 *
 * Severity:
 * - ERROR: HARD_BLOCK or LOCKED overlaps
 * - WARN: Other block type overlaps
 *
 * This is a fundamental constraint: a court can't be in two states at once.
 */
export const courtOverlapEvaluator = {
  id: 'COURT_OVERLAP',
  description: 'Prevent double-booking courts or overriding hard blocks',

  evaluate: (ctx: EngineContext, mutations: BlockMutation[]): EngineConflict[] => {
    const conflicts: EngineConflict[] = [];

    for (const mutation of mutations) {
      if (mutation.kind === 'REMOVE_BLOCK') {
        continue; // Removing blocks can't create overlaps
      }

      const block = mutation.block;
      const day = extractDate(block.start);
      const courtKey = `${block.court.tournamentId}|${block.court.venueId}|${block.court.courtId}|${day}`;

      // Get all blocks for this court on this day
      const existingIds = ctx.blocksByCourtDay.get(courtKey) ?? [];

      for (const existingId of existingIds) {
        // Skip if comparing to itself
        if (existingId === block.id) continue;

        const existing = ctx.blocksById.get(existingId);
        if (!existing) continue;

        // Check for overlap
        if (rangesOverlap(block, existing)) {
          // Determine severity based on block types
          const isHardConflict =
            existing.type === BLOCK_TYPES.HARD_BLOCK ||
            existing.type === BLOCK_TYPES.LOCKED ||
            block.type === BLOCK_TYPES.HARD_BLOCK ||
            block.type === BLOCK_TYPES.LOCKED;

          const severity = isHardConflict ? 'ERROR' : 'WARN';

          const overlapStart = block.start > existing.start ? block.start : existing.start;
          const overlapEnd = block.end < existing.end ? block.end : existing.end;

          conflicts.push({
            code: 'COURT_OVERLAP',
            message: `Block overlaps existing ${existing.type.toLowerCase()} (${existing.reason || 'no reason'}) on court ${block.court.courtId}`,
            severity: severity as 'ERROR' | 'WARN',
            timeRange: {
              start: overlapStart,
              end: overlapEnd,
            },
            courts: [block.court],
          });
        }
      }
    }

    return conflicts;
  },
};

// ============================================================================
// Match Window Evaluator
// ============================================================================

/**
 * Ensures availability windows are large enough for matches.
 *
 * Checks that AVAILABLE segments meet minimum duration requirements
 * based on match type and tournament configuration.
 *
 * Severity: WARN (small windows are concerning but not blocking)
 */
export const matchWindowEvaluator = {
  id: 'MATCH_WINDOW',
  description: 'Ensure availability windows are large enough for typical matches',

  evaluate: (ctx: EngineContext, mutations: BlockMutation[]): EngineConflict[] => {
    const conflicts: EngineConflict[] = [];

    // Default minimum match duration (can be overridden by tournament config)
    const minMatchMinutes = 60; // 1 hour minimum

    // Collect affected courts and days
    const affectedCourtDays = new Set<string>();
    for (const mutation of mutations) {
      const block = mutation.block;
      const day = extractDate(block.start);
      const courtKey = `${block.court.tournamentId}|${block.court.venueId}|${block.court.courtId}|${day}`;
      affectedCourtDays.add(courtKey);
    }

    // For each affected court/day, check if availability windows are too small
    for (const courtDayKey of affectedCourtDays) {
      const blockIds = ctx.blocksByCourtDay.get(courtDayKey) ?? [];
      const blocks = blockIds.map((id) => ctx.blocksById.get(id)!).filter(Boolean);

      // Sort blocks by start time
      const sortedBlocks = blocks.slice().sort((a, b) => a.start.localeCompare(b.start));

      // Find gaps between non-AVAILABLE blocks (these are potential match windows)
      let lastNonAvailableEnd: string | null = null;

      for (const block of sortedBlocks) {
        if (
          block.type !== BLOCK_TYPES.AVAILABLE &&
          block.type !== BLOCK_TYPES.SOFT_BLOCK &&
          block.type !== BLOCK_TYPES.RESERVED
        ) {
          if (lastNonAvailableEnd) {
            // Check the gap between last non-available and this one
            const gapMinutes = diffMinutes(lastNonAvailableEnd, block.start);

            if (gapMinutes > 0 && gapMinutes < minMatchMinutes) {
              conflicts.push({
                code: 'MATCH_WINDOW_TOO_SMALL',
                message: `Availability window (${gapMinutes} minutes) is smaller than typical match duration (${minMatchMinutes} minutes)`,
                severity: 'WARN',
                timeRange: {
                  start: lastNonAvailableEnd,
                  end: block.start,
                },
                courts: [block.court],
              });
            }
          }
          lastNonAvailableEnd = block.end;
        }
      }
    }

    return conflicts;
  },
};

// ============================================================================
// Adjacent Block Evaluator
// ============================================================================

/**
 * Warns about blocks that are adjacent without proper transition time.
 *
 * Tournament operations often need buffer time between different activities.
 * This evaluator flags cases where blocks transition too quickly.
 *
 * Severity: INFO (informational, not blocking)
 */
export const adjacentBlockEvaluator = {
  id: 'ADJACENT_BLOCK',
  description: 'Warn about blocks with no transition time',

  evaluate: (ctx: EngineContext, mutations: BlockMutation[]): EngineConflict[] => {
    const conflicts: EngineConflict[] = [];
    const minTransitionMinutes = 15; // 15 minutes between activities

    for (const mutation of mutations) {
      if (mutation.kind === 'REMOVE_BLOCK') continue;

      const block = mutation.block;
      const day = extractDate(block.start);
      const courtKey = `${block.court.tournamentId}|${block.court.venueId}|${block.court.courtId}|${day}`;

      const existingIds = ctx.blocksByCourtDay.get(courtKey) ?? [];

      for (const existingId of existingIds) {
        if (existingId === block.id) continue;

        const existing = ctx.blocksById.get(existingId);
        if (!existing) continue;

        // Check if blocks are adjacent (one ends exactly when other starts)
        const isAdjacent = existing.end === block.start || block.end === existing.start;

        if (isAdjacent && existing.type !== block.type) {
          conflicts.push({
            code: 'NO_TRANSITION_TIME',
            message: `${block.type} immediately follows ${existing.type} with no transition time (recommended: ${minTransitionMinutes} minutes)`,
            severity: 'INFO',
            timeRange: {
              start: existing.end,
              end: block.start,
            },
            courts: [block.court],
          });
        }
      }
    }

    return conflicts;
  },
};

// ============================================================================
// Lighting Evaluator
// ============================================================================

/**
 * Ensures courts without lights aren't scheduled after sunset.
 *
 * For outdoor courts without lighting, play must end before dark.
 * This evaluator checks court metadata and validates scheduling.
 *
 * Severity: ERROR (can't play in the dark)
 */
export const lightingEvaluator = {
  id: 'LIGHTING',
  description: 'Prevent scheduling on unlit courts after sunset',

  evaluate: (_ctx: EngineContext, mutations: BlockMutation[]): EngineConflict[] => {
    const conflicts: EngineConflict[] = [];

    // Default sunset time (should come from tournament location/date)
    // For now, use a fixed time
    const sunsetTime = '19:00'; // 7 PM

    for (const mutation of mutations) {
      if (mutation.kind === 'REMOVE_BLOCK') continue;

      const block = mutation.block;

      // Check if block extends past sunset
      const blockEndTime = block.end.slice(11, 16); // Extract 'HH:MM'

      if (blockEndTime > sunsetTime && (block.type === BLOCK_TYPES.AVAILABLE || block.type === BLOCK_TYPES.RESERVED)) {
        conflicts.push({
          code: 'AFTER_SUNSET',
          message: `Court scheduled after sunset (${sunsetTime}). Verify court has adequate lighting.`,
          severity: 'WARN', // WARN rather than ERROR since some courts may have lights
          timeRange: {
            start: `${block.start.slice(0, 11)}${sunsetTime}:00`,
            end: block.end,
          },
          courts: [block.court],
        });
      }
    }

    return conflicts;
  },
};

// ============================================================================
// Block Duration Evaluator
// ============================================================================

/**
 * Validates that blocks have reasonable durations.
 *
 * Catches potential data entry errors where blocks are too short or too long.
 *
 * Severity: WARN (might be intentional)
 */
export const blockDurationEvaluator = {
  id: 'BLOCK_DURATION',
  description: 'Validate block durations are reasonable',

  evaluate: (_ctx: EngineContext, mutations: BlockMutation[]): EngineConflict[] => {
    const conflicts: EngineConflict[] = [];

    const minReasonableDuration = 15; // 15 minutes
    const maxReasonableDuration = 12 * 60; // 12 hours

    for (const mutation of mutations) {
      if (mutation.kind === 'REMOVE_BLOCK') continue;

      const block = mutation.block;
      const durationMinutes = diffMinutes(block.start, block.end);

      if (durationMinutes < minReasonableDuration) {
        conflicts.push({
          code: 'BLOCK_TOO_SHORT',
          message: `Block duration (${durationMinutes} minutes) is unusually short. Minimum recommended: ${minReasonableDuration} minutes.`,
          severity: 'WARN',
          timeRange: block,
          courts: [block.court],
        });
      } else if (durationMinutes > maxReasonableDuration) {
        conflicts.push({
          code: 'BLOCK_TOO_LONG',
          message: `Block duration (${durationMinutes / 60} hours) is unusually long. Maximum recommended: ${maxReasonableDuration / 60} hours.`,
          severity: 'WARN',
          timeRange: block,
          courts: [block.court],
        });
      }
    }

    return conflicts;
  },
};

// ============================================================================
// Day Boundary Evaluator
// ============================================================================

/**
 * Ensures blocks don't span multiple days.
 *
 * Blocks should be contained within a single day for clarity.
 * Multi-day blocks can cause confusion in scheduling.
 *
 * Severity: ERROR (violates day-based model)
 */
export const dayBoundaryEvaluator = {
  id: 'DAY_BOUNDARY',
  description: 'Ensure blocks do not span multiple days',

  evaluate: (_ctx: EngineContext, mutations: BlockMutation[]): EngineConflict[] => {
    const conflicts: EngineConflict[] = [];

    for (const mutation of mutations) {
      if (mutation.kind === 'REMOVE_BLOCK') continue;

      const block = mutation.block;
      const startDay = extractDate(block.start);
      const endDay = extractDate(block.end);

      if (startDay !== endDay) {
        conflicts.push({
          code: 'SPANS_MULTIPLE_DAYS',
          message: `Block spans from ${startDay} to ${endDay}. Blocks should be contained within a single day.`,
          severity: 'ERROR',
          timeRange: block,
          courts: [block.court],
        });
      }
    }

    return conflicts;
  },
};

// ============================================================================
// Maintenance Window Evaluator
// ============================================================================

/**
 * Validates maintenance blocks are scheduled appropriately.
 *
 * Ensures maintenance doesn't conflict with peak usage times
 * and has sufficient duration.
 *
 * Severity: INFO (guidance, not enforced)
 */
export const maintenanceWindowEvaluator = {
  id: 'MAINTENANCE_WINDOW',
  description: 'Validate maintenance scheduling practices',

  evaluate: (_ctx: EngineContext, mutations: BlockMutation[]): EngineConflict[] => {
    const conflicts: EngineConflict[] = [];

    const peakHoursStart = '09:00';
    const peakHoursEnd = '17:00';
    const minMaintenanceDuration = 30; // 30 minutes

    for (const mutation of mutations) {
      if (mutation.kind === 'REMOVE_BLOCK') continue;

      const block = mutation.block;

      if (block.type === BLOCK_TYPES.MAINTENANCE) {
        const blockStartTime = block.start.slice(11, 16);
        const blockEndTime = block.end.slice(11, 16);
        const duration = diffMinutes(block.start, block.end);

        // Check if maintenance is during peak hours
        const isDuringPeakHours =
          (blockStartTime >= peakHoursStart && blockStartTime < peakHoursEnd) ||
          (blockEndTime > peakHoursStart && blockEndTime <= peakHoursEnd);

        if (isDuringPeakHours) {
          conflicts.push({
            code: 'MAINTENANCE_DURING_PEAK',
            message: `Maintenance scheduled during peak hours (${peakHoursStart}-${peakHoursEnd}). Consider scheduling during off-peak times.`,
            severity: 'INFO',
            timeRange: block,
            courts: [block.court],
          });
        }

        // Check duration
        if (duration < minMaintenanceDuration) {
          conflicts.push({
            code: 'MAINTENANCE_TOO_SHORT',
            message: `Maintenance duration (${duration} minutes) may be insufficient. Recommended minimum: ${minMaintenanceDuration} minutes.`,
            severity: 'INFO',
            timeRange: block,
            courts: [block.court],
          });
        }
      }
    }

    return conflicts;
  },
};

// ============================================================================
// Default Evaluator Set
// ============================================================================

/**
 * Standard set of evaluators for most tournaments.
 * Can be customized per tournament by adding/removing evaluators.
 */
export const defaultEvaluators = [
  courtOverlapEvaluator,
  dayBoundaryEvaluator, // Critical constraint
  blockDurationEvaluator,
  matchWindowEvaluator,
  adjacentBlockEvaluator,
  lightingEvaluator,
  maintenanceWindowEvaluator,
];

// ============================================================================
// Evaluator Registry
// ============================================================================

/**
 * Registry for managing available evaluators.
 * Allows dynamic registration and lookup.
 */
export class EvaluatorRegistry {
  private evaluators = new Map<string, any>();

  register(evaluator: any): void {
    this.evaluators.set(evaluator.id, evaluator);
  }

  unregister(evaluatorId: string): void {
    this.evaluators.delete(evaluatorId);
  }

  get(evaluatorId: string): any | undefined {
    return this.evaluators.get(evaluatorId);
  }

  getAll(): any[] {
    return Array.from(this.evaluators.values());
  }

  clear(): void {
    this.evaluators.clear();
  }
}

// ============================================================================
// Helper: Competition Factory Integration Point
// ============================================================================

/**
 * Placeholder for Follow-By evaluator that will integrate with proConflicts.
 *
 * This evaluator will:
 * 1. Build a preview tournamentRecord with proposed mutations
 * 2. Call Competition Factory's proConflicts()
 * 3. Extract conflicts related to player rest and follow-by dependencies
 * 4. Convert to EngineConflict format
 *
 * Implementation requires access to Competition Factory API.
 */
export const createFollowByEvaluator = (
  _factoryAPI: any, // eslint-disable-line @typescript-eslint/no-unused-vars
) => ({
  id: 'FOLLOW_BY',
  description: 'Player rest and follow-by conflicts using Competition Factory',

  evaluate: (
    _ctx: EngineContext, // eslint-disable-line @typescript-eslint/no-unused-vars
    _mutations: BlockMutation[], // eslint-disable-line @typescript-eslint/no-unused-vars
  ): EngineConflict[] => {
    // TODO: Implement when Competition Factory integration is ready
    return [];
  },
});

// ============================================================================
// Conflict Summary Utilities
// ============================================================================

/**
 * Group conflicts by severity for reporting
 */
export function groupConflictsBySeverity(conflicts: EngineConflict[]): {
  errors: EngineConflict[];
  warnings: EngineConflict[];
  info: EngineConflict[];
} {
  if (!Array.isArray(conflicts)) {
    return {
      errors: [],
      warnings: [],
      info: [],
    };
  }
  return {
    errors: conflicts?.filter((c) => c.severity === 'ERROR'),
    warnings: conflicts.filter((c) => c.severity === 'WARN'),
    info: conflicts.filter((c) => c.severity === 'INFO'),
  };
}

/**
 * Get highest severity from conflict list
 */
export function getHighestSeverity(conflicts: EngineConflict[]): 'ERROR' | 'WARN' | 'INFO' | null {
  if (!Array.isArray(conflicts)) return null;
  if (conflicts.some((c) => c.severity === 'ERROR')) return 'ERROR';
  if (conflicts.some((c) => c.severity === 'WARN')) return 'WARN';
  if (conflicts.some((c) => c.severity === 'INFO')) return 'INFO';
  return null;
}

/**
 * Format conflicts for display
 */
export function formatConflicts(conflicts: EngineConflict[]): string[] {
  if (!Array.isArray(conflicts)) return [];
  return conflicts.map((c) => {
    const courtStr = c.courts.map((court) => court.courtId).join(', ');
    const timeStr = `${c.timeRange.start.slice(11, 16)}-${c.timeRange.end.slice(11, 16)}`;
    return `[${c.severity}] ${c.code}: ${c.message} (${courtStr} @ ${timeStr})`;
  });
}
