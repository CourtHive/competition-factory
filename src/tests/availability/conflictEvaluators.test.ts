/**
 * Conflict Evaluators Tests
 *
 * Test suite for pluggable conflict detection system.
 */

import { describe, it, expect } from 'vitest';
import {
  BLOCK_TYPES,
  type Block,
  type BlockMutation,
  type EngineConfig,
  type EngineContext,
} from '@Assemblies/governors/availabilityGovernor/types';
import {
  adjacentBlockEvaluator,
  blockDurationEvaluator,
  courtOverlapEvaluator,
  dayBoundaryEvaluator,
  defaultEvaluators,
  EvaluatorRegistry,
  formatConflicts,
  getHighestSeverity,
  groupConflictsBySeverity,
  lightingEvaluator,
  maintenanceWindowEvaluator,
  matchWindowEvaluator,
} from '@Assemblies/governors/availabilityGovernor/conflictEvaluators';

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
  typePrecedence: [BLOCK_TYPES.HARD_BLOCK, BLOCK_TYPES.LOCKED, BLOCK_TYPES.MAINTENANCE, BLOCK_TYPES.AVAILABLE],
};

const mockCourt = {
  tournamentId: TEST_TOURNAMENT,
  venueId: TEST_VENUE,
  courtId: TEST_COURT,
};

function createBlock(id: string, start: string, end: string, type: any = BLOCK_TYPES.AVAILABLE): Block {
  return {
    id,
    court: mockCourt,
    start,
    end,
    type,
  };
}

function createContext(blocks: Block[]): EngineContext {
  const blocksById = new Map(blocks.map((b) => [b.id, b]));
  const blocksByCourtDay = new Map<string, string[]>();

  for (const block of blocks) {
    const day = block.start.slice(0, 10);
    const key = `${block.court.tournamentId}|${block.court.venueId}|${block.court.courtId}|${day}`;
    const existing = blocksByCourtDay.get(key) || [];
    existing.push(block.id);
    blocksByCourtDay.set(key, existing);
  }

  return {
    config: mockConfig,
    tournamentRecord: {},
    blocksById,
    blocksByCourtDay,
    templates: new Map(),
    rules: new Map(),
    layerVisibility: new Map(),
  };
}

function createMutation(
  block: Block,
  kind: 'ADD_BLOCK' | 'UPDATE_BLOCK' | 'REMOVE_BLOCK' = 'ADD_BLOCK',
): BlockMutation {
  return { kind, block };
}

// ============================================================================
// Court Overlap Evaluator Tests
// ============================================================================

describe('courtOverlapEvaluator', () => {
  it('should detect overlapping blocks on same court', () => {
    const existingBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T14:00:00', BLOCK_TYPES.AVAILABLE);
    const newBlock = createBlock('2', '2026-06-15T12:00:00', '2026-06-15T16:00:00', BLOCK_TYPES.MAINTENANCE);

    const ctx = createContext([existingBlock]);
    const mutations = [createMutation(newBlock)];

    const conflicts = courtOverlapEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].code).toBe('COURT_OVERLAP');
    expect(conflicts[0].severity).toBe('WARN');
    expect(conflicts[0].timeRange.start).toBe('2026-06-15T12:00:00');
    expect(conflicts[0].timeRange.end).toBe('2026-06-15T14:00:00');
  });

  it('should flag HARD_BLOCK overlaps as ERROR', () => {
    const existingBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T14:00:00', BLOCK_TYPES.HARD_BLOCK);
    const newBlock = createBlock('2', '2026-06-15T12:00:00', '2026-06-15T16:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([existingBlock]);
    const mutations = [createMutation(newBlock)];

    const conflicts = courtOverlapEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('ERROR');
  });

  it('should not flag overlaps when new block is HARD_BLOCK', () => {
    const existingBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T14:00:00', BLOCK_TYPES.AVAILABLE);
    const newBlock = createBlock('2', '2026-06-15T12:00:00', '2026-06-15T16:00:00', BLOCK_TYPES.HARD_BLOCK);

    const ctx = createContext([existingBlock]);
    const mutations = [createMutation(newBlock)];

    const conflicts = courtOverlapEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].severity).toBe('ERROR');
  });

  it('should not detect overlaps on different courts', () => {
    const existingBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T14:00:00', BLOCK_TYPES.AVAILABLE);
    const newBlock = createBlock('2', '2026-06-15T12:00:00', '2026-06-15T16:00:00', BLOCK_TYPES.AVAILABLE);
    newBlock.court = { ...mockCourt, courtId: 'court-2' };

    const ctx = createContext([existingBlock]);
    const mutations = [createMutation(newBlock)];

    const conflicts = courtOverlapEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(0);
  });

  it('should not detect conflicts for adjacent blocks', () => {
    const existingBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.AVAILABLE);
    const newBlock = createBlock('2', '2026-06-15T12:00:00', '2026-06-15T14:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([existingBlock]);
    const mutations = [createMutation(newBlock)];

    const conflicts = courtOverlapEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(0);
  });

  it('should skip REMOVE_BLOCK mutations', () => {
    const existingBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T14:00:00', BLOCK_TYPES.AVAILABLE);
    const blockToRemove = createBlock('2', '2026-06-15T12:00:00', '2026-06-15T16:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([existingBlock]);
    const mutations = [createMutation(blockToRemove, 'REMOVE_BLOCK')];

    const conflicts = courtOverlapEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(0);
  });
});

// ============================================================================
// Match Window Evaluator Tests
// ============================================================================

describe('matchWindowEvaluator', () => {
  it('should warn about small availability windows', () => {
    const block1 = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T10:30:00', BLOCK_TYPES.MAINTENANCE);
    const block2 = createBlock('2', '2026-06-15T11:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.MAINTENANCE);

    // Both blocks need to be in context to detect the gap
    const ctx = createContext([block1, block2]);
    const mutations = [createMutation(block2)];

    const conflicts = matchWindowEvaluator.evaluate(ctx, mutations);

    // 30-minute window between 10:30 and 11:00 should trigger warning
    expect(conflicts.length).toBeGreaterThan(0);
    expect(conflicts.some((c) => c.code === 'MATCH_WINDOW_TOO_SMALL')).toBe(true);
  });

  it('should not warn about adequate windows', () => {
    const block1 = createBlock('1', '2026-06-15T08:00:00', '2026-06-15T09:00:00', BLOCK_TYPES.MAINTENANCE);
    const block2 = createBlock('2', '2026-06-15T11:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.MAINTENANCE);

    const ctx = createContext([block1]);
    const mutations = [createMutation(block2)];

    const conflicts = matchWindowEvaluator.evaluate(ctx, mutations);

    // 2-hour window should be fine
    expect(conflicts).toHaveLength(0);
  });
});

// ============================================================================
// Adjacent Block Evaluator Tests
// ============================================================================

describe('adjacentBlockEvaluator', () => {
  it('should flag adjacent blocks of different types', () => {
    const existingBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.MAINTENANCE);
    const newBlock = createBlock('2', '2026-06-15T12:00:00', '2026-06-15T14:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([existingBlock]);
    const mutations = [createMutation(newBlock)];

    const conflicts = adjacentBlockEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].code).toBe('NO_TRANSITION_TIME');
    expect(conflicts[0].severity).toBe('INFO');
  });

  it('should not flag adjacent blocks of same type', () => {
    const existingBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.AVAILABLE);
    const newBlock = createBlock('2', '2026-06-15T12:00:00', '2026-06-15T14:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([existingBlock]);
    const mutations = [createMutation(newBlock)];

    const conflicts = adjacentBlockEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(0);
  });
});

// ============================================================================
// Lighting Evaluator Tests
// ============================================================================

describe('lightingEvaluator', () => {
  it('should warn about scheduling after sunset', () => {
    const lateBlock = createBlock('1', '2026-06-15T19:00:00', '2026-06-15T21:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([]);
    const mutations = [createMutation(lateBlock)];

    const conflicts = lightingEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].code).toBe('AFTER_SUNSET');
    expect(conflicts[0].severity).toBe('WARN');
  });

  it('should not warn about daytime scheduling', () => {
    const dayBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([]);
    const mutations = [createMutation(dayBlock)];

    const conflicts = lightingEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(0);
  });

  it('should not warn about non-scheduling blocks after sunset', () => {
    const maintenanceBlock = createBlock('1', '2026-06-15T20:00:00', '2026-06-15T22:00:00', BLOCK_TYPES.MAINTENANCE);

    const ctx = createContext([]);
    const mutations = [createMutation(maintenanceBlock)];

    const conflicts = lightingEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(0);
  });
});

// ============================================================================
// Block Duration Evaluator Tests
// ============================================================================

describe('blockDurationEvaluator', () => {
  it('should warn about very short blocks', () => {
    const shortBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T10:10:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([]);
    const mutations = [createMutation(shortBlock)];

    const conflicts = blockDurationEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].code).toBe('BLOCK_TOO_SHORT');
    expect(conflicts[0].severity).toBe('WARN');
  });

  it('should warn about very long blocks', () => {
    const longBlock = createBlock('1', '2026-06-15T08:00:00', '2026-06-15T22:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([]);
    const mutations = [createMutation(longBlock)];

    const conflicts = blockDurationEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].code).toBe('BLOCK_TOO_LONG');
    expect(conflicts[0].severity).toBe('WARN');
  });

  it('should not warn about reasonable durations', () => {
    const normalBlock = createBlock('1', '2026-06-15T10:00:00', '2026-06-15T12:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([]);
    const mutations = [createMutation(normalBlock)];

    const conflicts = blockDurationEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(0);
  });
});

// ============================================================================
// Day Boundary Evaluator Tests
// ============================================================================

describe('dayBoundaryEvaluator', () => {
  it('should detect blocks spanning multiple days', () => {
    const spanningBlock = createBlock('1', '2026-06-15T22:00:00', '2026-06-16T02:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([]);
    const mutations = [createMutation(spanningBlock)];

    const conflicts = dayBoundaryEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].code).toBe('SPANS_MULTIPLE_DAYS');
    expect(conflicts[0].severity).toBe('ERROR');
  });

  it('should not flag blocks within same day', () => {
    const sameDayBlock = createBlock('1', '2026-06-15T08:00:00', '2026-06-15T22:00:00', BLOCK_TYPES.AVAILABLE);

    const ctx = createContext([]);
    const mutations = [createMutation(sameDayBlock)];

    const conflicts = dayBoundaryEvaluator.evaluate(ctx, mutations);

    expect(conflicts).toHaveLength(0);
  });
});

// ============================================================================
// Maintenance Window Evaluator Tests
// ============================================================================

describe('maintenanceWindowEvaluator', () => {
  it('should suggest avoiding maintenance during peak hours', () => {
    const peakMaintenanceBlock = createBlock(
      '1',
      '2026-06-15T14:00:00',
      '2026-06-15T15:00:00',
      BLOCK_TYPES.MAINTENANCE,
    );

    const ctx = createContext([]);
    const mutations = [createMutation(peakMaintenanceBlock)];

    const conflicts = maintenanceWindowEvaluator.evaluate(ctx, mutations);

    expect(conflicts.some((c) => c.code === 'MAINTENANCE_DURING_PEAK')).toBe(true);
    expect(conflicts.every((c) => c.severity === 'INFO')).toBe(true);
  });

  it('should not flag maintenance during off-peak hours', () => {
    const offPeakBlock = createBlock('1', '2026-06-15T20:00:00', '2026-06-15T21:00:00', BLOCK_TYPES.MAINTENANCE);

    const ctx = createContext([]);
    const mutations = [createMutation(offPeakBlock)];

    const conflicts = maintenanceWindowEvaluator.evaluate(ctx, mutations);

    expect(conflicts.some((c) => c.code === 'MAINTENANCE_DURING_PEAK')).toBe(false);
  });

  it('should warn about very short maintenance', () => {
    const shortMaintenanceBlock = createBlock(
      '1',
      '2026-06-15T20:00:00',
      '2026-06-15T20:15:00',
      BLOCK_TYPES.MAINTENANCE,
    );

    const ctx = createContext([]);
    const mutations = [createMutation(shortMaintenanceBlock)];

    const conflicts = maintenanceWindowEvaluator.evaluate(ctx, mutations);

    expect(conflicts.some((c) => c.code === 'MAINTENANCE_TOO_SHORT')).toBe(true);
  });
});

// ============================================================================
// Evaluator Registry Tests
// ============================================================================

describe('EvaluatorRegistry', () => {
  it('should register and retrieve evaluators', () => {
    const registry = new EvaluatorRegistry();
    registry.register(courtOverlapEvaluator);

    const retrieved = registry.get('COURT_OVERLAP');
    expect(retrieved).toBe(courtOverlapEvaluator);
  });

  it('should unregister evaluators', () => {
    const registry = new EvaluatorRegistry();
    registry.register(courtOverlapEvaluator);
    registry.unregister('COURT_OVERLAP');

    const retrieved = registry.get('COURT_OVERLAP');
    expect(retrieved).toBeUndefined();
  });

  it('should return all registered evaluators', () => {
    const registry = new EvaluatorRegistry();
    registry.register(courtOverlapEvaluator);
    registry.register(dayBoundaryEvaluator);

    const all = registry.getAll();
    expect(all).toHaveLength(2);
  });

  it('should clear all evaluators', () => {
    const registry = new EvaluatorRegistry();
    registry.register(courtOverlapEvaluator);
    registry.register(dayBoundaryEvaluator);
    registry.clear();

    const all = registry.getAll();
    expect(all).toHaveLength(0);
  });
});

// ============================================================================
// Default Evaluators Tests
// ============================================================================

describe('defaultEvaluators', () => {
  it('should include all standard evaluators', () => {
    expect(defaultEvaluators).toContain(courtOverlapEvaluator);
    expect(defaultEvaluators).toContain(dayBoundaryEvaluator);
    expect(defaultEvaluators).toContain(blockDurationEvaluator);
    expect(defaultEvaluators).toContain(matchWindowEvaluator);
    expect(defaultEvaluators).toContain(adjacentBlockEvaluator);
    expect(defaultEvaluators).toContain(lightingEvaluator);
    expect(defaultEvaluators).toContain(maintenanceWindowEvaluator);
  });

  it('should have at least 5 evaluators', () => {
    expect(defaultEvaluators.length).toBeGreaterThanOrEqual(5);
  });
});

// ============================================================================
// Utility Function Tests
// ============================================================================

describe('groupConflictsBySeverity', () => {
  it('should group conflicts by severity', () => {
    const conflicts = [
      {
        code: 'TEST1',
        message: 'Error',
        severity: 'ERROR' as const,
        timeRange: { start: '10:00', end: '12:00' },
        courts: [mockCourt],
      },
      {
        code: 'TEST2',
        message: 'Warning',
        severity: 'WARN' as const,
        timeRange: { start: '10:00', end: '12:00' },
        courts: [mockCourt],
      },
      {
        code: 'TEST3',
        message: 'Info',
        severity: 'INFO' as const,
        timeRange: { start: '10:00', end: '12:00' },
        courts: [mockCourt],
      },
    ];

    const grouped = groupConflictsBySeverity(conflicts);

    expect(grouped.errors).toHaveLength(1);
    expect(grouped.warnings).toHaveLength(1);
    expect(grouped.info).toHaveLength(1);
  });
});

describe('getHighestSeverity', () => {
  it('should return ERROR when errors present', () => {
    const conflicts = [
      {
        code: 'TEST1',
        message: 'Error',
        severity: 'ERROR' as const,
        timeRange: { start: '10:00', end: '12:00' },
        courts: [mockCourt],
      },
      {
        code: 'TEST2',
        message: 'Warning',
        severity: 'WARN' as const,
        timeRange: { start: '10:00', end: '12:00' },
        courts: [mockCourt],
      },
    ];

    expect(getHighestSeverity(conflicts)).toBe('ERROR');
  });

  it('should return WARN when only warnings present', () => {
    const conflicts = [
      {
        code: 'TEST1',
        message: 'Warning',
        severity: 'WARN' as const,
        timeRange: { start: '10:00', end: '12:00' },
        courts: [mockCourt],
      },
    ];

    expect(getHighestSeverity(conflicts)).toBe('WARN');
  });

  it('should return null for empty array', () => {
    expect(getHighestSeverity([])).toBeNull();
  });
});

describe('formatConflicts', () => {
  it('should format conflicts as strings', () => {
    const conflicts = [
      {
        code: 'TEST',
        message: 'Test conflict',
        severity: 'ERROR' as const,
        timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
        courts: [mockCourt],
      },
    ];

    const formatted = formatConflicts(conflicts);

    expect(formatted).toHaveLength(1);
    expect(formatted[0]).toContain('[ERROR]');
    expect(formatted[0]).toContain('TEST');
    expect(formatted[0]).toContain('Test conflict');
    expect(formatted[0]).toContain('court-1');
  });
});
