/**
 * Rail Derivation Algorithm - INVERTED PARADIGM
 *
 * Converts overlapping blocks into non-overlapping rail segments using
 * a sweep-line algorithm with status resolution based on type precedence.
 *
 * INVERTED PARADIGM: No blocks = Available Time
 * - Default state is AVAILABLE (time within open hours without blocks)
 * - Paint ONLY what makes courts UNAVAILABLE (MAINTENANCE, PRACTICE, RESERVED, BLOCKED, CLOSED, SCHEDULED)
 * - AVAILABLE segments are derived by subtracting blocks from open hours
 * - Outside open hours = CLOSED by default
 *
 * Core principle: Given blocks that may overlap, derive a continuous timeline
 * where each segment has exactly one effective status.
 */

import { extractDate } from '@Tools/dateTime';

import {
  BLOCK_TYPES,
  type Block,
  type BlockId,
  type BlockType,
  type CourtRef,
  type Edge,
  type EngineConfig,
  type RailSegment,
  type TimeRange,
} from './types';

// ============================================================================
// Key Generation
// ============================================================================

export function courtDayKey(court: CourtRef, day: string): string {
  return `${court.tournamentId}|${court.venueId}|${court.courtId}|${day}`;
}

export function courtKey(court: CourtRef): string {
  return `${court.tournamentId}|${court.venueId}|${court.courtId}`;
}

export function venueKey(tournamentId: string, venueId: string): string {
  return `${tournamentId}|${venueId}`;
}

export function venueDayKey(tournamentId: string, venueId: string, day: string): string {
  return `${tournamentId}|${venueId}|${day}`;
}

// ============================================================================
// ID Resolution Helpers
// ============================================================================

/**
 * Resolve the canonical venue identifier from a TODS venue object.
 * Prefers venueId, falls back to venueName.
 */
export function resolveVenueId(venue: { venueId?: string; venueName?: string }): string {
  return venue.venueId || venue.venueName || 'unknown-venue';
}

/**
 * Resolve the canonical court identifier from a TODS court object.
 * Prefers courtId, falls back to courtName.
 */
export function resolveCourtId(court: { courtId?: string; courtName?: string }): string {
  return court.courtId || court.courtName || 'unknown-court';
}

// ============================================================================
// Time Range Utilities
// ============================================================================

/**
 * Clamp a block's time range to fit within a day's bounds
 */
export function clampToDayRange(block: Block, dayRange: TimeRange): Block | null {
  const blockStart = block.start;
  const blockEnd = block.end;
  const dayStart = dayRange?.start;
  const dayEnd = dayRange?.end;

  // Block completely outside day range
  if (blockEnd <= dayStart || blockStart >= dayEnd) {
    return null;
  }

  // Clamp to day bounds (string comparison works for ISO datetime)
  const clampedStart = blockStart < dayStart ? dayStart : blockStart;
  const clampedEnd = blockEnd > dayEnd ? dayEnd : blockEnd;

  return {
    ...block,
    start: clampedStart,
    end: clampedEnd,
  };
}

export function rangesOverlap(a: TimeRange, b: TimeRange): boolean {
  // String comparison works for ISO datetime strings
  return a?.start < b?.end && b?.start < a?.end;
}

export function overlappingRange(a: TimeRange, b: TimeRange): TimeRange {
  // String comparison works for ISO datetime strings
  const overlapStart = a?.start > b?.start ? a?.start : b?.start;
  const overlapEnd = a?.end < b?.end ? a?.end : b?.end;

  return {
    start: overlapStart,
    end: overlapEnd,
  };
}

export function diffMinutes(start: string, end: string): number {
  const startDate = new Date(start);
  const endDate = new Date(end);
  const result = (endDate.getTime() - startDate.getTime()) / (1000 * 60);
  return Number.isNaN(result) ? 0 : result;
}

// ============================================================================
// Status Resolution
// ============================================================================

/**
 * Resolve the effective status for a segment given contributing blocks.
 * Uses type precedence from config: first type in precedence array wins.
 *
 * INVERTED PARADIGM: No blocks = AVAILABLE
 * - If no contributing blocks, status is AVAILABLE (not UNSPECIFIED)
 * - Blocks represent UNAVAILABLE time
 */
export function resolveStatus(
  contributingIds: BlockId[],
  blocksById: Map<BlockId, Block>,
  precedence: BlockType[],
): BlockType {
  if (contributingIds.length === 0 || !precedence || precedence.length === 0) {
    return BLOCK_TYPES.AVAILABLE; // No blocks = available time (inverted paradigm)
  }

  // Build a rank map for fast lookups
  const typeRank = new Map(precedence.map((type, index) => [type, index]));

  let bestType: BlockType = BLOCK_TYPES.AVAILABLE;
  let bestRank = Infinity;

  for (const blockId of contributingIds) {
    const block = blocksById.get(blockId);
    if (!block) continue;

    const rank = typeRank.get(block.type);
    if (rank !== undefined && rank < bestRank) {
      bestRank = rank;
      bestType = block.type;
    }
  }

  return bestType;
}

// ============================================================================
// Edge Extraction & Sorting
// ============================================================================

/**
 * Extract START and END edges from blocks
 */
export function buildEdges(blocks: Block[]): Edge[] {
  const edges: Edge[] = [];

  if (!Array.isArray(blocks)) return edges;

  for (const block of blocks) {
    edges.push({
      time: block.start,
      type: 'START',
      blockId: block.id,
    });
    edges.push({
      time: block.end,
      type: 'END',
      blockId: block.id,
    });
  }

  return edges;
}

/**
 * Sort edges by time, with END before START for ties
 * (to avoid zero-length segments)
 */
export function sortEdges(edges: Edge[]): Edge[] {
  if (!Array.isArray(edges)) return [];
  return edges.slice().sort((a, b) => {
    const timeCompare = a.time.localeCompare(b.time);
    if (timeCompare !== 0) return timeCompare;

    // For same time, END before START
    if (a.type === 'END' && b.type === 'START') return -1;
    if (a.type === 'START' && b.type === 'END') return 1;
    return 0;
  });
}

// ============================================================================
// Sweep-Line Algorithm
// ============================================================================

/**
 * Core rail derivation algorithm using sweep-line approach.
 *
 * Algorithm:
 * 1. Clamp all blocks to day range
 * 2. Extract and sort edges (START/END)
 * 3. Sweep through edges maintaining active block set
 * 4. Between consecutive edges, create segment with resolved status
 * 5. Merge adjacent segments with identical status
 *
 * @param blocks - All blocks for a court/day
 * @param dayRange - Time bounds for the day
 * @param config - Engine configuration (for type precedence)
 * @returns Non-overlapping rail segments
 */
export function deriveRailSegments(blocks: Block[], dayRange: TimeRange, config: EngineConfig): RailSegment[] {
  // Step 1: Clamp blocks to day range

  if (!Array.isArray(blocks) || !dayRange || !config) {
    return [];
  }

  const clampedBlocks = blocks
    .map((block) => clampToDayRange(block, dayRange))
    .filter((block): block is Block => block !== null);

  if (clampedBlocks.length === 0) {
    // No blocks - entire day is AVAILABLE (inverted paradigm)
    return [
      {
        start: dayRange.start,
        end: dayRange.end,
        status: BLOCK_TYPES.AVAILABLE,
        contributingBlocks: [],
      },
    ];
  }

  // Build blocksById map for fast lookup
  const blocksById = new Map(clampedBlocks.map((b) => [b.id, b]));

  // Step 2: Extract and sort edges
  const edges = sortEdges(buildEdges(clampedBlocks));

  // Step 3: Sweep-line
  const activeBlocks = new Set<BlockId>();
  const segments: RailSegment[] = [];
  let prevTime = dayRange.start;

  for (const edge of edges) {
    const currTime = edge.time;

    // Create segment from prevTime to currTime if there's a gap
    if (currTime > prevTime) {
      const contributingBlocks = Array.from(activeBlocks);
      const status = resolveStatus(contributingBlocks, blocksById, config.typePrecedence);

      segments.push({
        start: prevTime,
        end: currTime,
        status,
        contributingBlocks,
      });
    }

    // Update active set
    if (edge.type === 'START') {
      activeBlocks.add(edge.blockId);
    } else {
      activeBlocks.delete(edge.blockId);
    }

    prevTime = currTime;
  }

  // Step 4: Tail segment after last edge
  if (prevTime < dayRange.end) {
    const contributingBlocks = Array.from(activeBlocks);
    const status = resolveStatus(contributingBlocks, blocksById, config.typePrecedence);

    segments.push({
      start: prevTime,
      end: dayRange.end,
      status,
      contributingBlocks,
    });
  }

  // Step 5: Merge adjacent segments with same status
  return mergeAdjacentSegments(segments);
}

// ============================================================================
// Segment Merging
// ============================================================================

/**
 * Merge adjacent segments that have the same status and contributing blocks.
 * This reduces visual noise and improves rendering performance.
 */
export function mergeAdjacentSegments(segments: RailSegment[]): RailSegment[] {
  if (segments.length === 0) return segments;

  const merged: RailSegment[] = [];
  let current = { ...segments[0] };

  for (let i = 1; i < segments.length; i++) {
    const next = segments[i];

    // Can merge if:
    // 1. Same status
    // 2. Same contributing blocks (order doesn't matter)
    // 3. Adjacent in time
    const sameStatus = current.status === next.status;
    const sameBlocks =
      current.contributingBlocks.length === next.contributingBlocks.length &&
      current.contributingBlocks.every((id) => next.contributingBlocks.includes(id));
    const adjacent = current.end === next.start;

    if (sameStatus && sameBlocks && adjacent) {
      // Extend current segment
      current.end = next.end;
    } else {
      // Push current and start new
      merged.push(current);
      current = { ...next };
    }
  }

  // Don't forget the last segment
  merged.push(current);

  return merged;
}

// ============================================================================
// Helper: Extract Day from ISO DateTime
// ============================================================================

/**
 * Extract day ID (YYYY-MM-DD) from ISO datetime string
 */
export function extractDay(isoDateTime: string): string {
  return extractDate(isoDateTime);
}

/**
 * Build a day range from a day ID and config
 */
export function buildDayRange(day: string, config: EngineConfig): TimeRange {
  return {
    start: `${day}T${config?.dayStartTime}:00`,
    end: `${day}T${config?.dayEndTime}:00`,
  };
}

// ============================================================================
// Validation Helpers
// ============================================================================

/**
 * Check if segments are properly ordered and non-overlapping
 */
export function validateSegments(segments: RailSegment[]): boolean {
  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];

    // Check valid time range
    if (segment.start >= segment.end) return false;

    // Check ordering and adjacency with next segment
    if (i < segments.length - 1) {
      const next = segments[i + 1];

      // Check non-overlapping
      if (segment.end > next.start) return false;

      // Check adjacency (no gaps)
      if (segment.end !== next.start) return false;
    }
  }

  return true;
}
