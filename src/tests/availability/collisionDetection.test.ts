/**
 * Collision Detection & Clamping Tests
 *
 * Test suite for the collision detection module that implements
 * collision-aware clamping for drag-create operations.
 *
 * Core principles under test:
 * - Half-open intervals: [start, end) where start < end
 * - Adjacency allowed: end === start is valid (not an overlap)
 * - No overlaps permitted: intervals cannot share internal time points
 * - Clamping: new blocks stop at the first collision boundary
 */

import { describe, it, expect } from 'vitest';
import {
  BLOCK_TYPES,
  type Block,
  type BlockType,
  type CourtRef,
} from '@Assemblies/governors/availabilityGovernor/types';
import {
  clampDragToCollisions,
  findBlocksContainingTime,
  intervalsOverlap,
  sortBlocksByStart,
  timeInsideBlock,
} from '@Assemblies/governors/availabilityGovernor/collisionDetection';

// ============================================================================
// Test Fixtures & Helpers
// ============================================================================

const TEST_TOURNAMENT = 'test-tournament';
const TEST_VENUE = 'venue-1';
const TEST_COURT = 'court-1';

const mockCourt: CourtRef = {
  tournamentId: TEST_TOURNAMENT,
  venueId: TEST_VENUE,
  courtId: TEST_COURT,
};

function createBlock(id: string, start: string, end: string, type: BlockType = BLOCK_TYPES.BLOCKED): Block {
  return { id, court: mockCourt, start, end, type };
}

/** Convert an ISO datetime string to Unix milliseconds (UTC) */
function toMs(iso: string): number {
  return new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime();
}

// ============================================================================
// intervalsOverlap
// ============================================================================

describe('intervalsOverlap', () => {
  it('should detect overlapping intervals', () => {
    const a = { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' };
    const b = { start: '2026-06-15T11:00:00', end: '2026-06-15T13:00:00' };
    expect(intervalsOverlap(a, b)).toBe(true);
  });

  it('should return false for non-overlapping intervals with a gap', () => {
    const a = { start: '2026-06-15T08:00:00', end: '2026-06-15T09:00:00' };
    const b = { start: '2026-06-15T10:00:00', end: '2026-06-15T11:00:00' };
    expect(intervalsOverlap(a, b)).toBe(false);
  });

  it('should return false for adjacent (touching) intervals', () => {
    // Adjacency: a.end === b.start. Under half-open [start, end), this is NOT overlap.
    const a = { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' };
    const b = { start: '2026-06-15T12:00:00', end: '2026-06-15T14:00:00' };
    expect(intervalsOverlap(a, b)).toBe(false);
  });

  it('should return true when one interval contains the other', () => {
    const outer = { start: '2026-06-15T08:00:00', end: '2026-06-15T16:00:00' };
    const inner = { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' };
    expect(intervalsOverlap(outer, inner)).toBe(true);
    expect(intervalsOverlap(inner, outer)).toBe(true);
  });

  it('should return true for identical ranges', () => {
    const a = { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' };
    const b = { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' };
    expect(intervalsOverlap(a, b)).toBe(true);
  });

  it('should return true for partial overlap from the left', () => {
    const a = { start: '2026-06-15T09:00:00', end: '2026-06-15T11:00:00' };
    const b = { start: '2026-06-15T10:00:00', end: '2026-06-15T13:00:00' };
    expect(intervalsOverlap(a, b)).toBe(true);
  });

  it('should return true for partial overlap from the right', () => {
    const a = { start: '2026-06-15T11:00:00', end: '2026-06-15T14:00:00' };
    const b = { start: '2026-06-15T09:00:00', end: '2026-06-15T12:00:00' };
    expect(intervalsOverlap(a, b)).toBe(true);
  });
});

// ============================================================================
// timeInsideBlock
// ============================================================================

describe('timeInsideBlock', () => {
  const block = createBlock('b1', '2026-06-15T10:00:00', '2026-06-15T12:00:00');

  it('should return true for time at block start (inclusive)', () => {
    expect(timeInsideBlock(toMs('2026-06-15T10:00:00'), block)).toBe(true);
  });

  it('should return false for time at block end (exclusive, half-open)', () => {
    expect(timeInsideBlock(toMs('2026-06-15T12:00:00'), block)).toBe(false);
  });

  it('should return true for time inside the block', () => {
    expect(timeInsideBlock(toMs('2026-06-15T11:00:00'), block)).toBe(true);
  });

  it('should return false for time before the block', () => {
    expect(timeInsideBlock(toMs('2026-06-15T09:00:00'), block)).toBe(false);
  });

  it('should return false for time after the block', () => {
    expect(timeInsideBlock(toMs('2026-06-15T13:00:00'), block)).toBe(false);
  });
});

// ============================================================================
// findBlocksContainingTime
// ============================================================================

describe('findBlocksContainingTime', () => {
  it('should find multiple blocks containing a time point', () => {
    const blocks = [
      createBlock('b1', '2026-06-15T09:00:00', '2026-06-15T12:00:00'),
      createBlock('b2', '2026-06-15T10:00:00', '2026-06-15T14:00:00'),
      createBlock('b3', '2026-06-15T15:00:00', '2026-06-15T17:00:00'),
    ];

    // 11:00 falls inside both b1 ([09:00, 12:00)) and b2 ([10:00, 14:00))
    const found = findBlocksContainingTime(toMs('2026-06-15T11:00:00'), blocks);
    expect(found).toHaveLength(2);
    expect(found.map((b) => b.id)).toContain('b1');
    expect(found.map((b) => b.id)).toContain('b2');
  });

  it('should return empty array when no blocks contain the time', () => {
    const blocks = [
      createBlock('b1', '2026-06-15T09:00:00', '2026-06-15T10:00:00'),
      createBlock('b2', '2026-06-15T14:00:00', '2026-06-15T16:00:00'),
    ];

    const found = findBlocksContainingTime(toMs('2026-06-15T12:00:00'), blocks);
    expect(found).toHaveLength(0);
  });

  it('should handle a single matching block', () => {
    const blocks = [createBlock('b1', '2026-06-15T10:00:00', '2026-06-15T12:00:00')];

    const found = findBlocksContainingTime(toMs('2026-06-15T11:00:00'), blocks);
    expect(found).toHaveLength(1);
    expect(found[0].id).toBe('b1');
  });
});

// ============================================================================
// clampDragToCollisions - forward drag
// ============================================================================

describe('clampDragToCollisions - forward drag', () => {
  it('should not clamp when there are no blocks', () => {
    const anchor = toMs('2026-06-15T10:00:00');
    const cursor = toMs('2026-06-15T12:00:00');

    const result = clampDragToCollisions(anchor, cursor, []);

    expect(result.start).toBe(anchor);
    expect(result.end).toBe(cursor);
    expect(result.clamped).toBe(false);
    expect(result.clampedBy).toBeUndefined();
    expect(result.direction).toBe('forward');
  });

  it('should clamp to the start of a block ahead', () => {
    const anchor = toMs('2026-06-15T10:00:00');
    const cursor = toMs('2026-06-15T14:00:00');
    const blocker = createBlock('b1', '2026-06-15T12:00:00', '2026-06-15T13:00:00');

    const result = clampDragToCollisions(anchor, cursor, [blocker]);

    expect(result.start).toBe(anchor);
    expect(result.end).toBe(toMs('2026-06-15T12:00:00'));
    expect(result.clamped).toBe(true);
    expect(result.clampedBy?.id).toBe('b1');
    expect(result.direction).toBe('forward');
  });

  it('should clamp to the nearest of multiple blocks ahead', () => {
    const anchor = toMs('2026-06-15T10:00:00');
    const cursor = toMs('2026-06-15T16:00:00');

    const blocks = [
      createBlock('b1', '2026-06-15T14:00:00', '2026-06-15T15:00:00'),
      createBlock('b2', '2026-06-15T12:00:00', '2026-06-15T13:00:00'),
    ];

    const result = clampDragToCollisions(anchor, cursor, blocks);

    // Should clamp to b2 at 12:00, not b1 at 14:00
    expect(result.start).toBe(anchor);
    expect(result.end).toBe(toMs('2026-06-15T12:00:00'));
    expect(result.clamped).toBe(true);
    expect(result.clampedBy?.id).toBe('b2');
  });

  it('should not clamp when block starts exactly at cursor (adjacency allowed)', () => {
    const anchor = toMs('2026-06-15T10:00:00');
    const cursor = toMs('2026-06-15T12:00:00');
    const blocker = createBlock('b1', '2026-06-15T12:00:00', '2026-06-15T14:00:00');

    const result = clampDragToCollisions(anchor, cursor, [blocker]);

    expect(result.start).toBe(anchor);
    expect(result.end).toBe(cursor);
    expect(result.clamped).toBe(false);
    expect(result.direction).toBe('forward');
  });

  it('should report direction as forward', () => {
    const anchor = toMs('2026-06-15T10:00:00');
    const cursor = toMs('2026-06-15T11:00:00');

    const result = clampDragToCollisions(anchor, cursor, []);
    expect(result.direction).toBe('forward');
  });
});

// ============================================================================
// clampDragToCollisions - backward drag
// ============================================================================

describe('clampDragToCollisions - backward drag', () => {
  it('should not clamp when there are no blocks', () => {
    const anchor = toMs('2026-06-15T14:00:00');
    const cursor = toMs('2026-06-15T10:00:00');

    const result = clampDragToCollisions(anchor, cursor, []);

    expect(result.start).toBe(cursor);
    expect(result.end).toBe(anchor);
    expect(result.clamped).toBe(false);
    expect(result.clampedBy).toBeUndefined();
    expect(result.direction).toBe('backward');
  });

  it('should clamp to the end of a block behind', () => {
    const anchor = toMs('2026-06-15T14:00:00');
    const cursor = toMs('2026-06-15T10:00:00');
    const blocker = createBlock('b1', '2026-06-15T11:00:00', '2026-06-15T12:00:00');

    const result = clampDragToCollisions(anchor, cursor, [blocker]);

    expect(result.start).toBe(toMs('2026-06-15T12:00:00'));
    expect(result.end).toBe(anchor);
    expect(result.clamped).toBe(true);
    expect(result.clampedBy?.id).toBe('b1');
    expect(result.direction).toBe('backward');
  });

  it('should clamp to the nearest of multiple blocks behind', () => {
    const anchor = toMs('2026-06-15T16:00:00');
    const cursor = toMs('2026-06-15T08:00:00');

    const blocks = [
      createBlock('b1', '2026-06-15T09:00:00', '2026-06-15T10:00:00'),
      createBlock('b2', '2026-06-15T12:00:00', '2026-06-15T13:00:00'),
    ];

    const result = clampDragToCollisions(anchor, cursor, blocks);

    // Should clamp to b2's end at 13:00 (the nearest block behind anchor)
    expect(result.start).toBe(toMs('2026-06-15T13:00:00'));
    expect(result.end).toBe(anchor);
    expect(result.clamped).toBe(true);
    expect(result.clampedBy?.id).toBe('b2');
  });

  it('should report direction as backward', () => {
    const anchor = toMs('2026-06-15T14:00:00');
    const cursor = toMs('2026-06-15T10:00:00');

    const result = clampDragToCollisions(anchor, cursor, []);
    expect(result.direction).toBe('backward');
  });
});

// ============================================================================
// sortBlocksByStart
// ============================================================================

describe('sortBlocksByStart', () => {
  it('should sort blocks ascending by start time', () => {
    const blocks = [
      createBlock('b3', '2026-06-15T14:00:00', '2026-06-15T15:00:00'),
      createBlock('b1', '2026-06-15T08:00:00', '2026-06-15T09:00:00'),
      createBlock('b2', '2026-06-15T11:00:00', '2026-06-15T12:00:00'),
    ];

    sortBlocksByStart(blocks);

    expect(blocks[0].id).toBe('b1');
    expect(blocks[1].id).toBe('b2');
    expect(blocks[2].id).toBe('b3');
  });

  it('should handle already sorted blocks', () => {
    const blocks = [
      createBlock('b1', '2026-06-15T08:00:00', '2026-06-15T09:00:00'),
      createBlock('b2', '2026-06-15T11:00:00', '2026-06-15T12:00:00'),
      createBlock('b3', '2026-06-15T14:00:00', '2026-06-15T15:00:00'),
    ];

    sortBlocksByStart(blocks);

    expect(blocks[0].id).toBe('b1');
    expect(blocks[1].id).toBe('b2');
    expect(blocks[2].id).toBe('b3');
  });

  it('should handle an empty array', () => {
    const blocks: Block[] = [];
    sortBlocksByStart(blocks);
    expect(blocks).toHaveLength(0);
  });
});
