/**
 * Rail Derivation Algorithm Tests - INVERTED PARADIGM
 *
 * Test suite for the sweep-line algorithm that converts overlapping blocks
 * into non-overlapping rail segments with status resolution.
 *
 * INVERTED PARADIGM: No blocks = Available Time
 * - Default state is AVAILABLE (no block needed)
 * - Paint ONLY what makes courts UNAVAILABLE
 * - AVAILABLE segments are derived by subtracting blocks from open hours
 */

import { describe, it, expect } from 'vitest';
import {
  BLOCK_TYPES,
  type Block,
  type BlockType,
  type EngineConfig,
  type TimeRange,
} from '@Assemblies/governors/availabilityGovernor/types';
import {
  buildDayRange,
  clampToDayRange,
  courtDayKey,
  deriveRailSegments,
  diffMinutes,
  extractDay,
  mergeAdjacentSegments,
  overlappingRange,
  rangesOverlap,
  resolveStatus,
  validateSegments,
} from '@Assemblies/governors/availabilityGovernor/railDerivation';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_TOURNAMENT = 'test-tournament';
const TEST_VENUE = 'facility-1';
const TEST_COURT = 'court-1';

const mockConfig: EngineConfig = {
  tournamentId: TEST_TOURNAMENT,
  dayStartTime: '06:00',
  dayEndTime: '23:00',
  slotMinutes: 15,
  typePrecedence: [
    BLOCK_TYPES.HARD_BLOCK,
    BLOCK_TYPES.LOCKED,
    BLOCK_TYPES.SCHEDULED,
    BLOCK_TYPES.MAINTENANCE,
    BLOCK_TYPES.CLOSED,
    BLOCK_TYPES.BLOCKED,
    BLOCK_TYPES.PRACTICE,
    BLOCK_TYPES.RESERVED,
    BLOCK_TYPES.SOFT_BLOCK,
    BLOCK_TYPES.AVAILABLE,
    BLOCK_TYPES.UNSPECIFIED,
  ],
};

const mockCourt = {
  tournamentId: TEST_TOURNAMENT,
  venueId: TEST_VENUE,
  courtId: TEST_COURT,
};

function createBlock(id: string, start: string, end: string, type: BlockType = BLOCK_TYPES.AVAILABLE): Block {
  return {
    id,
    court: mockCourt,
    start,
    end,
    type,
  };
}

// ============================================================================
// Utility Functions Tests
// ============================================================================

describe('courtDayKey', () => {
  it('should generate consistent keys', () => {
    const key1 = courtDayKey(mockCourt, '2026-06-15');
    const key2 = courtDayKey(mockCourt, '2026-06-15');
    expect(key1).toBe(key2);
    expect(key1).toContain('test-tournament');
    expect(key1).toContain('facility-1');
    expect(key1).toContain('court-1');
    expect(key1).toContain('2026-06-15');
  });

  it('should generate different keys for different days', () => {
    const key1 = courtDayKey(mockCourt, '2026-06-15');
    const key2 = courtDayKey(mockCourt, '2026-06-16');
    expect(key1).not.toBe(key2);
  });
});

describe('extractDay', () => {
  it('should extract day from ISO datetime', () => {
    expect(extractDay('2026-06-15T10:30:00')).toBe('2026-06-15');
    expect(extractDay('2026-06-15T00:00:00')).toBe('2026-06-15');
    expect(extractDay('2026-12-31T23:59:59')).toBe('2026-12-31');
  });
});

describe('buildDayRange', () => {
  it('should build correct day range from config', () => {
    const range = buildDayRange('2026-06-15', mockConfig);
    expect(range.start).toBe('2026-06-15T06:00:00');
    expect(range.end).toBe('2026-06-15T23:00:00');
  });
});

describe('diffMinutes', () => {
  it('should calculate minute difference', () => {
    expect(diffMinutes('2026-06-15T10:00:00', '2026-06-15T10:30:00')).toBe(30);
    expect(diffMinutes('2026-06-15T10:00:00', '2026-06-15T11:00:00')).toBe(60);
    expect(diffMinutes('2026-06-15T10:00:00', '2026-06-15T12:30:00')).toBe(150);
  });
});

describe('rangesOverlap', () => {
  it('should detect overlapping ranges', () => {
    const a: TimeRange = { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' };
    const b: TimeRange = { start: '2026-06-15T11:00:00', end: '2026-06-15T13:00:00' };
    expect(rangesOverlap(a, b)).toBe(true);
  });

  it('should detect non-overlapping ranges', () => {
    const a: TimeRange = { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' };
    const b: TimeRange = { start: '2026-06-15T12:00:00', end: '2026-06-15T14:00:00' };
    expect(rangesOverlap(a, b)).toBe(false);
  });

  it('should handle completely separate ranges', () => {
    const a: TimeRange = { start: '2026-06-15T10:00:00', end: '2026-06-15T11:00:00' };
    const b: TimeRange = { start: '2026-06-15T13:00:00', end: '2026-06-15T14:00:00' };
    expect(rangesOverlap(a, b)).toBe(false);
  });
});

describe('overlappingRange', () => {
  it('should compute overlapping portion', () => {
    const a: TimeRange = { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' };
    const b: TimeRange = { start: '2026-06-15T11:00:00', end: '2026-06-15T13:00:00' };
    const overlap = overlappingRange(a, b);
    expect(overlap.start).toBe('2026-06-15T11:00:00');
    expect(overlap.end).toBe('2026-06-15T12:00:00');
  });
});

describe('clampToDayRange', () => {
  const dayRange: TimeRange = {
    start: '2026-06-15T06:00:00',
    end: '2026-06-15T23:00:00',
  };

  it('should clamp block that starts before day', () => {
    const block = createBlock('1', '2026-06-15T05:00:00', '2026-06-15T10:00:00');
    const clamped = clampToDayRange(block, dayRange);
    expect(clamped?.start).toBe('2026-06-15T06:00:00');
    expect(clamped?.end).toBe('2026-06-15T10:00:00');
  });

  it('should clamp block that ends after day', () => {
    const block = createBlock('1', '2026-06-15T20:00:00', '2026-06-16T01:00:00');
    const clamped = clampToDayRange(block, dayRange);
    expect(clamped?.start).toBe('2026-06-15T20:00:00');
    expect(clamped?.end).toBe('2026-06-15T23:00:00');
  });

  it('should return null for block completely outside day', () => {
    const block = createBlock('1', '2026-06-14T10:00:00', '2026-06-14T12:00:00');
    const clamped = clampToDayRange(block, dayRange);
    expect(clamped).toBeNull();
  });

  it('should not modify block within day range', () => {
    const block = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00');
    const clamped = clampToDayRange(block, dayRange);
    expect(clamped?.start).toBe('2026-06-15T10:00:00');
    expect(clamped?.end).toBe('2026-06-15T12:00:00');
  });
});

// ============================================================================
// Status Resolution Tests
// ============================================================================

describe('resolveStatus', () => {
  const blocksById = new Map<string, Block>([
    ['1', createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.AVAILABLE)],
    ['2', createBlock('2', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.MAINTENANCE)],
    ['3', createBlock('3', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.HARD_BLOCK)],
  ]);

  it('should return AVAILABLE for empty contributing blocks (inverted paradigm)', () => {
    const status = resolveStatus([], blocksById, mockConfig.typePrecedence);
    expect(status).toBe(BLOCK_TYPES.AVAILABLE);
  });

  it('should return single block type', () => {
    const status = resolveStatus(['1'], blocksById, mockConfig.typePrecedence);
    expect(status).toBe(BLOCK_TYPES.AVAILABLE);
  });

  it('should resolve precedence - HARD_BLOCK wins', () => {
    const status = resolveStatus(['1', '2', '3'], blocksById, mockConfig.typePrecedence);
    expect(status).toBe(BLOCK_TYPES.HARD_BLOCK);
  });

  it('should resolve precedence - MAINTENANCE over AVAILABLE', () => {
    const status = resolveStatus(['1', '2'], blocksById, mockConfig.typePrecedence);
    expect(status).toBe(BLOCK_TYPES.MAINTENANCE);
  });
});

// ============================================================================
// Segment Merging Tests
// ============================================================================

describe('mergeAdjacentSegments', () => {
  it('should merge adjacent segments with same status', () => {
    const segments = [
      {
        start: '2026-06-15T10:00:00',
        end: '2026-06-15T11:00:00',
        status: BLOCK_TYPES.AVAILABLE as BlockType,
        contributingBlocks: ['1'],
      },
      {
        start: '2026-06-15T11:00:00',
        end: '2026-06-15T12:00:00',
        status: BLOCK_TYPES.AVAILABLE as BlockType,
        contributingBlocks: ['1'],
      },
    ];

    const merged = mergeAdjacentSegments(segments);
    expect(merged).toHaveLength(1);
    expect(merged[0].start).toBe('2026-06-15T10:00:00');
    expect(merged[0].end).toBe('2026-06-15T12:00:00');
    expect(merged[0].status).toBe(BLOCK_TYPES.AVAILABLE);
  });

  it('should not merge segments with different status', () => {
    const segments = [
      {
        start: '2026-06-15T10:00:00',
        end: '2026-06-15T11:00:00',
        status: BLOCK_TYPES.AVAILABLE as BlockType,
        contributingBlocks: ['1'],
      },
      {
        start: '2026-06-15T11:00:00',
        end: '2026-06-15T12:00:00',
        status: BLOCK_TYPES.BLOCKED as BlockType,
        contributingBlocks: ['2'],
      },
    ];

    const merged = mergeAdjacentSegments(segments);
    expect(merged).toHaveLength(2);
  });

  it('should not merge non-adjacent segments', () => {
    const segments = [
      {
        start: '2026-06-15T10:00:00',
        end: '2026-06-15T11:00:00',
        status: BLOCK_TYPES.AVAILABLE as BlockType,
        contributingBlocks: ['1'],
      },
      {
        start: '2026-06-15T11:30:00',
        end: '2026-06-15T12:00:00',
        status: BLOCK_TYPES.AVAILABLE as BlockType,
        contributingBlocks: ['1'],
      },
    ];

    const merged = mergeAdjacentSegments(segments);
    expect(merged).toHaveLength(2);
  });
});

// ============================================================================
// Rail Derivation Tests
// ============================================================================

describe('deriveRailSegments', () => {
  const dayRange: TimeRange = {
    start: '2026-06-15T06:00:00',
    end: '2026-06-15T23:00:00',
  };

  it('should handle empty blocks - entire day is AVAILABLE (inverted paradigm)', () => {
    const segments = deriveRailSegments([], dayRange, mockConfig);
    expect(segments).toHaveLength(1);
    expect(segments[0].status).toBe(BLOCK_TYPES.AVAILABLE);
    expect(segments[0].start).toBe(dayRange.start);
    expect(segments[0].end).toBe(dayRange.end);
  });

  it('should create segments with maintenance block', () => {
    const blocks = [createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.MAINTENANCE)];
    const segments = deriveRailSegments(blocks, dayRange, mockConfig);

    // Should have 3 segments: available before, maintenance during, available after
    expect(segments).toHaveLength(3);
    expect(segments[0].status).toBe(BLOCK_TYPES.AVAILABLE);
    expect(segments[1].status).toBe(BLOCK_TYPES.MAINTENANCE);
    expect(segments[2].status).toBe(BLOCK_TYPES.AVAILABLE);
  });

  it('should handle overlapping blocks with precedence', () => {
    const blocks = [
      createBlock('1', '2026-06-15T10:00:00', '2026-06-15T14:00:00', BLOCK_TYPES.PRACTICE),
      createBlock('2', '2026-06-15T12:00:00', '2026-06-15T16:00:00', BLOCK_TYPES.MAINTENANCE),
    ];
    const segments = deriveRailSegments(blocks, dayRange, mockConfig);

    // Find the overlap segment (12:00-14:00)
    const overlapSegment = segments.find((s) => s.start === '2026-06-15T12:00:00' && s.end === '2026-06-15T14:00:00');
    expect(overlapSegment).toBeDefined();
    expect(overlapSegment?.status).toBe(BLOCK_TYPES.MAINTENANCE); // Higher precedence
    expect(overlapSegment?.contributingBlocks).toHaveLength(2);
  });

  it('should handle adjacent non-overlapping blocks', () => {
    const blocks = [
      createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.MAINTENANCE),
      createBlock('2', '2026-06-15T12:00:00', '2026-06-15T14:00:00', BLOCK_TYPES.BLOCKED),
    ];
    const segments = deriveRailSegments(blocks, dayRange, mockConfig);

    const maintenanceSegment = segments.find((s) => s.status === BLOCK_TYPES.MAINTENANCE);
    const blockedSegment = segments.find((s) => s.status === BLOCK_TYPES.BLOCKED);

    expect(maintenanceSegment).toBeDefined();
    expect(blockedSegment).toBeDefined();
    expect(maintenanceSegment?.end).toBe(blockedSegment?.start);
  });

  it('should handle adjacent blocks with same status (but different IDs)', () => {
    const blocks = [
      createBlock('1', '2026-06-15T10:00:00', '2026-06-15T11:00:00', BLOCK_TYPES.MAINTENANCE),
      createBlock('2', '2026-06-15T11:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.MAINTENANCE),
    ];
    const segments = deriveRailSegments(blocks, dayRange, mockConfig);

    // Two separate blocks = two separate segments (even with same status)
    // because contributing blocks are different
    const maintenanceSegments = segments.filter((s) => s.status === BLOCK_TYPES.MAINTENANCE);
    expect(maintenanceSegments).toHaveLength(2);
    expect(maintenanceSegments[0].contributingBlocks).toEqual(['1']);
    expect(maintenanceSegments[1].contributingBlocks).toEqual(['2']);
  });

  it('should handle complex overlapping scenario', () => {
    const blocks = [
      createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.MAINTENANCE),
      createBlock('2', '2026-06-15T11:00:00', '2026-06-15T13:00:00', BLOCK_TYPES.HARD_BLOCK),
      createBlock('3', '2026-06-15T14:00:00', '2026-06-15T16:00:00', BLOCK_TYPES.PRACTICE),
    ];
    const segments = deriveRailSegments(blocks, dayRange, mockConfig);

    // Validate structure
    expect(validateSegments(segments)).toBe(true);

    // Check that HARD_BLOCK wins during 11:00-12:00
    const hardBlockSegment = segments.find((s) => s.start === '2026-06-15T11:00:00' && s.end === '2026-06-15T12:00:00');
    expect(hardBlockSegment?.status).toBe(BLOCK_TYPES.HARD_BLOCK);

    // Check that we have AVAILABLE segments before and after blocks
    const availableSegments = segments.filter((s) => s.status === BLOCK_TYPES.AVAILABLE);
    expect(availableSegments.length).toBeGreaterThan(0);
  });

  it('should clamp blocks to day range', () => {
    const blocks = [
      createBlock('1', '2026-06-15T05:00:00', '2026-06-15T10:00:00', BLOCK_TYPES.MAINTENANCE),
      createBlock('2', '2026-06-15T20:00:00', '2026-06-16T02:00:00', BLOCK_TYPES.BLOCKED),
    ];
    const segments = deriveRailSegments(blocks, dayRange, mockConfig);

    // First segment should start at day start
    expect(segments[0].start).toBe('2026-06-15T06:00:00');

    // Last segment should end at day end
    expect(segments[segments.length - 1].end).toBe('2026-06-15T23:00:00');

    // Validate overall structure
    expect(validateSegments(segments)).toBe(true);
  });

  // ============================================================================
  // INVERTED PARADIGM SPECIFIC TESTS
  // ============================================================================

  describe('Inverted Paradigm - No Blocks = Available', () => {
    it('should show entire day as AVAILABLE when no blocks exist', () => {
      const segments = deriveRailSegments([], dayRange, mockConfig);
      expect(segments).toHaveLength(1);
      expect(segments[0].status).toBe(BLOCK_TYPES.AVAILABLE);
      expect(segments[0].start).toBe(dayRange.start);
      expect(segments[0].end).toBe(dayRange.end);
      expect(segments[0].contributingBlocks).toHaveLength(0);
    });

    it('should create AVAILABLE gaps between UNAVAILABLE blocks', () => {
      const blocks = [
        createBlock('1', '2026-06-15T08:00:00', '2026-06-15T09:00:00', BLOCK_TYPES.MAINTENANCE),
        createBlock('2', '2026-06-15T14:00:00', '2026-06-15T15:00:00', BLOCK_TYPES.PRACTICE),
      ];
      const segments = deriveRailSegments(blocks, dayRange, mockConfig);

      // Should have: AVAILABLE, MAINTENANCE, AVAILABLE, PRACTICE, AVAILABLE
      expect(segments).toHaveLength(5);

      // Check middle AVAILABLE segment
      const middleAvailable = segments[2];
      expect(middleAvailable.status).toBe(BLOCK_TYPES.AVAILABLE);
      expect(middleAvailable.start).toBe('2026-06-15T09:00:00');
      expect(middleAvailable.end).toBe('2026-06-15T14:00:00');
      expect(middleAvailable.contributingBlocks).toHaveLength(0);
    });

    it('should handle maintenance block reducing available time', () => {
      const blocks = [createBlock('1', '2026-06-15T12:00:00', '2026-06-15T13:00:00', BLOCK_TYPES.MAINTENANCE)];
      const segments = deriveRailSegments(blocks, dayRange, mockConfig);

      const availableSegments = segments.filter((s) => s.status === BLOCK_TYPES.AVAILABLE);
      const maintenanceSegments = segments.filter((s) => s.status === BLOCK_TYPES.MAINTENANCE);

      expect(maintenanceSegments).toHaveLength(1);
      expect(availableSegments).toHaveLength(2); // Before and after maintenance

      // Calculate total available time
      const totalAvailableMinutes = availableSegments.reduce((sum, seg) => {
        return sum + diffMinutes(seg.start, seg.end);
      }, 0);

      // Day is 6am-11pm = 17 hours = 1020 minutes
      // Maintenance is 1 hour = 60 minutes
      // Available should be 1020 - 60 = 960 minutes
      expect(totalAvailableMinutes).toBe(960);
    });

    it('should handle scheduled blocks reducing available time', () => {
      const blocks = [createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.SCHEDULED)];
      const segments = deriveRailSegments(blocks, dayRange, mockConfig);

      const availableSegments = segments.filter((s) => s.status === BLOCK_TYPES.AVAILABLE);
      const scheduledSegments = segments.filter((s) => s.status === BLOCK_TYPES.SCHEDULED);

      expect(scheduledSegments).toHaveLength(1);
      expect(availableSegments).toHaveLength(2); // Before and after scheduled time
    });

    it('should handle multiple block types - all reducing available time', () => {
      const blocks = [
        createBlock('1', '2026-06-15T08:00:00', '2026-06-15T09:00:00', BLOCK_TYPES.MAINTENANCE),
        createBlock('2', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.PRACTICE),
        createBlock('3', '2026-06-15T14:00:00', '2026-06-15T16:00:00', BLOCK_TYPES.RESERVED),
        createBlock('4', '2026-06-15T18:00:00', '2026-06-15T19:00:00', BLOCK_TYPES.BLOCKED),
        createBlock('5', '2026-06-15T20:00:00', '2026-06-15T21:00:00', BLOCK_TYPES.SCHEDULED),
      ];
      const segments = deriveRailSegments(blocks, dayRange, mockConfig);

      const availableSegments = segments.filter((s) => s.status === BLOCK_TYPES.AVAILABLE);

      // Should have AVAILABLE segments between each block
      expect(availableSegments.length).toBeGreaterThan(0);

      // Verify we have all the block types
      expect(segments.some((s) => s.status === BLOCK_TYPES.MAINTENANCE)).toBe(true);
      expect(segments.some((s) => s.status === BLOCK_TYPES.PRACTICE)).toBe(true);
      expect(segments.some((s) => s.status === BLOCK_TYPES.RESERVED)).toBe(true);
      expect(segments.some((s) => s.status === BLOCK_TYPES.BLOCKED)).toBe(true);
      expect(segments.some((s) => s.status === BLOCK_TYPES.SCHEDULED)).toBe(true);
    });

    it('should handle CLOSED blocks marking unavailable time', () => {
      const blocks = [
        createBlock('1', '2026-06-15T06:00:00', '2026-06-15T08:00:00', BLOCK_TYPES.CLOSED),
        createBlock('2', '2026-06-15T21:00:00', '2026-06-15T23:00:00', BLOCK_TYPES.CLOSED),
      ];
      const segments = deriveRailSegments(blocks, dayRange, mockConfig);

      const closedSegments = segments.filter((s) => s.status === BLOCK_TYPES.CLOSED);
      const availableSegments = segments.filter((s) => s.status === BLOCK_TYPES.AVAILABLE);

      // Should have 2 CLOSED segments and 1 AVAILABLE segment in between
      expect(closedSegments).toHaveLength(2);
      expect(availableSegments).toHaveLength(1);

      // The available segment should be between the two closed segments
      const availableSegment = availableSegments[0];
      expect(availableSegment.start).toBe('2026-06-15T08:00:00');
      expect(availableSegment.end).toBe('2026-06-15T21:00:00');
    });
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('validateSegments', () => {
  it('should validate properly ordered segments', () => {
    const segments = [
      {
        start: '2026-06-15T10:00:00',
        end: '2026-06-15T11:00:00',
        status: BLOCK_TYPES.AVAILABLE as BlockType,
        contributingBlocks: [],
      },
      {
        start: '2026-06-15T11:00:00',
        end: '2026-06-15T12:00:00',
        status: BLOCK_TYPES.BLOCKED as BlockType,
        contributingBlocks: [],
      },
    ];
    expect(validateSegments(segments)).toBe(true);
  });

  it('should detect overlapping segments', () => {
    const segments = [
      {
        start: '2026-06-15T10:00:00',
        end: '2026-06-15T11:30:00',
        status: BLOCK_TYPES.AVAILABLE as BlockType,
        contributingBlocks: [],
      },
      {
        start: '2026-06-15T11:00:00',
        end: '2026-06-15T12:00:00',
        status: BLOCK_TYPES.BLOCKED as BlockType,
        contributingBlocks: [],
      },
    ];
    expect(validateSegments(segments)).toBe(false);
  });

  it('should detect gaps in segments', () => {
    const segments = [
      {
        start: '2026-06-15T10:00:00',
        end: '2026-06-15T11:00:00',
        status: BLOCK_TYPES.AVAILABLE as BlockType,
        contributingBlocks: [],
      },
      {
        start: '2026-06-15T11:30:00',
        end: '2026-06-15T12:00:00',
        status: BLOCK_TYPES.BLOCKED as BlockType,
        contributingBlocks: [],
      },
    ];
    expect(validateSegments(segments)).toBe(false);
  });

  it('should detect invalid time ranges', () => {
    const segments = [
      {
        start: '2026-06-15T11:00:00',
        end: '2026-06-15T10:00:00', // end before start
        status: BLOCK_TYPES.AVAILABLE as BlockType,
        contributingBlocks: [],
      },
    ];
    expect(validateSegments(segments)).toBe(false);
  });
});
