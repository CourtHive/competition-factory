/**
 * Plan State Tests
 *
 * Tests for the scheduling profile plan state (Phase 1C).
 * Covers:
 * - computePlanItemId utility
 * - Engine plan CRUD: addPlanItem, removePlanItem, updatePlanItem, movePlanItem
 * - Query methods: getDayPlan, getAllPlans
 * - Event emissions (PLAN_CHANGED, STATE_CHANGED)
 * - Lifecycle: plans cleared on init(), preserved on updateTournamentRecord()
 * - Snapshot: plans survive simulateBlocks()
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AvailabilityEngine } from '@Assemblies/engines/availability/AvailabilityEngine';
import { computePlanItemId, type PlanItem } from '@Assemblies/governors/availabilityGovernor/planState';
import type { EngineEvent } from '@Assemblies/governors/availabilityGovernor/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_TOURNAMENT = 'test-tournament';
const TEST_VENUE = 'venue-1';
const DAY_1 = '2026-06-15';
const DAY_2 = '2026-06-16';

function makeBasicRecord() {
  return {
    tournamentId: TEST_TOURNAMENT,
    startDate: DAY_1,
    endDate: '2026-06-17',
    venues: [
      {
        venueId: TEST_VENUE,
        courts: [
          { courtId: 'court-1', courtName: 'Court 1' },
          { courtId: 'court-2', courtName: 'Court 2' },
        ],
      },
    ],
  };
}

function makePlanItemInput(overrides?: Partial<Omit<PlanItem, 'planItemId'>>): Omit<PlanItem, 'planItemId'> {
  return {
    day: DAY_1,
    venueId: TEST_VENUE,
    eventId: 'event-1',
    roundNumber: 1,
    ...overrides,
  };
}

function createInitializedEngine(): AvailabilityEngine {
  const engine = new AvailabilityEngine();
  engine.init(makeBasicRecord());
  return engine;
}

// ============================================================================
// computePlanItemId
// ============================================================================

describe('computePlanItemId', () => {
  it('should produce correct ID format without drawId', () => {
    const id = computePlanItemId({
      day: DAY_1,
      venueId: TEST_VENUE,
      eventId: 'event-1',
      roundNumber: 1,
    });
    expect(id).toBe(`${DAY_1}|${TEST_VENUE}|event-1|R1`);
  });

  it('should include drawId when present', () => {
    const id = computePlanItemId({
      day: DAY_1,
      venueId: TEST_VENUE,
      eventId: 'event-1',
      drawId: 'draw-1',
      roundNumber: 2,
    });
    expect(id).toBe(`${DAY_1}|${TEST_VENUE}|event-1|draw-1|R2`);
  });

  it('should exclude drawId when absent', () => {
    const id = computePlanItemId({
      day: DAY_1,
      venueId: TEST_VENUE,
      eventId: 'event-1',
      drawId: undefined,
      roundNumber: 3,
    });
    expect(id).toBe(`${DAY_1}|${TEST_VENUE}|event-1|R3`);
  });
});

// ============================================================================
// addPlanItem
// ============================================================================

describe('addPlanItem', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = createInitializedEngine();
  });

  it('should create item with computed ID', () => {
    const item = engine.addPlanItem(makePlanItemInput());
    expect(item.planItemId).toBe(`${DAY_1}|${TEST_VENUE}|event-1|R1`);
    expect(item.day).toBe(DAY_1);
    expect(item.venueId).toBe(TEST_VENUE);
    expect(item.eventId).toBe('event-1');
    expect(item.roundNumber).toBe(1);
  });

  it('should replace item with same key', () => {
    engine.addPlanItem(makePlanItemInput({ matchUpType: 'SINGLES' }));
    const replaced = engine.addPlanItem(makePlanItemInput({ matchUpType: 'DOUBLES' }));

    const plan = engine.getDayPlan(DAY_1);
    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(1);
    expect(plan!.items[0].matchUpType).toBe('DOUBLES');
    expect(plan!.items[0].planItemId).toBe(replaced.planItemId);
  });

  it('should emit PLAN_CHANGED event', () => {
    const events: EngineEvent[] = [];
    engine.subscribe((e) => events.push(e));

    engine.addPlanItem(makePlanItemInput());

    const planEvents = events.filter((e) => e.type === 'PLAN_CHANGED');
    expect(planEvents).toHaveLength(1);
    expect(planEvents[0].payload.action).toBe('ADD');
    expect(planEvents[0].payload.planItem.planItemId).toBe(`${DAY_1}|${TEST_VENUE}|event-1|R1`);
  });

  it('should emit STATE_CHANGED event', () => {
    const events: EngineEvent[] = [];
    engine.subscribe((e) => events.push(e));

    engine.addPlanItem(makePlanItemInput());

    const stateEvents = events.filter((e) => e.type === 'STATE_CHANGED');
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0].payload.reason).toBe('PLAN_CHANGED');
  });
});

// ============================================================================
// removePlanItem
// ============================================================================

describe('removePlanItem', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = createInitializedEngine();
  });

  it('should remove by ID and return true', () => {
    const item = engine.addPlanItem(makePlanItemInput());
    const result = engine.removePlanItem(item.planItemId);

    expect(result).toBe(true);
    expect(engine.getDayPlan(DAY_1)).toBeNull();
  });

  it('should return false for non-existent ID', () => {
    const result = engine.removePlanItem('nonexistent-id');
    expect(result).toBe(false);
  });

  it('should clean up empty day plans', () => {
    const item = engine.addPlanItem(makePlanItemInput());
    engine.removePlanItem(item.planItemId);

    // Day plan should be null (cleaned up, not an empty items array)
    expect(engine.getDayPlan(DAY_1)).toBeNull();
  });

  it('should emit events', () => {
    const item = engine.addPlanItem(makePlanItemInput());

    const events: EngineEvent[] = [];
    engine.subscribe((e) => events.push(e));

    engine.removePlanItem(item.planItemId);

    const planEvents = events.filter((e) => e.type === 'PLAN_CHANGED');
    expect(planEvents).toHaveLength(1);
    expect(planEvents[0].payload.action).toBe('REMOVE');

    const stateEvents = events.filter((e) => e.type === 'STATE_CHANGED');
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0].payload.reason).toBe('PLAN_CHANGED');
  });
});

// ============================================================================
// updatePlanItem
// ============================================================================

describe('updatePlanItem', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = createInitializedEngine();
  });

  it('should update allowed fields', () => {
    const item = engine.addPlanItem(makePlanItemInput());
    const updated = engine.updatePlanItem(item.planItemId, {
      notBeforeTime: '10:00',
      estimatedDurationMinutes: 90,
      matchUpType: 'DOUBLES',
      roundSegment: { segmentNumber: 1, segmentsCount: 2 },
    });

    expect(updated).not.toBeNull();
    expect(updated!.notBeforeTime).toBe('10:00');
    expect(updated!.estimatedDurationMinutes).toBe(90);
    expect(updated!.matchUpType).toBe('DOUBLES');
    expect(updated!.roundSegment).toEqual({ segmentNumber: 1, segmentsCount: 2 });
    // Key fields unchanged
    expect(updated!.planItemId).toBe(item.planItemId);
    expect(updated!.day).toBe(DAY_1);
  });

  it('should return null for non-existent ID', () => {
    const result = engine.updatePlanItem('nonexistent-id', { matchUpType: 'SINGLES' });
    expect(result).toBeNull();
  });

  it('should emit events', () => {
    const item = engine.addPlanItem(makePlanItemInput());

    const events: EngineEvent[] = [];
    engine.subscribe((e) => events.push(e));

    engine.updatePlanItem(item.planItemId, { matchUpType: 'DOUBLES' });

    const planEvents = events.filter((e) => e.type === 'PLAN_CHANGED');
    expect(planEvents).toHaveLength(1);
    expect(planEvents[0].payload.action).toBe('UPDATE');

    const stateEvents = events.filter((e) => e.type === 'STATE_CHANGED');
    expect(stateEvents).toHaveLength(1);
    expect(stateEvents[0].payload.reason).toBe('PLAN_CHANGED');
  });
});

// ============================================================================
// movePlanItem
// ============================================================================

describe('movePlanItem', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = createInitializedEngine();
  });

  it('should move to new day', () => {
    const item = engine.addPlanItem(makePlanItemInput({ day: DAY_1 }));
    const moved = engine.movePlanItem(item.planItemId, DAY_2);

    expect(moved).not.toBeNull();
    expect(moved!.day).toBe(DAY_2);
    // Original day should be cleaned up
    expect(engine.getDayPlan(DAY_1)).toBeNull();
    // New day should have the item
    const dayPlan = engine.getDayPlan(DAY_2);
    expect(dayPlan).not.toBeNull();
    expect(dayPlan!.items).toHaveLength(1);
  });

  it('should recompute planItemId with new day', () => {
    const item = engine.addPlanItem(makePlanItemInput({ day: DAY_1 }));
    const moved = engine.movePlanItem(item.planItemId, DAY_2);

    expect(moved).not.toBeNull();
    const expectedId = computePlanItemId({ ...item, day: DAY_2 });
    expect(moved!.planItemId).toBe(expectedId);
    expect(moved!.planItemId).not.toBe(item.planItemId);
  });

  it('should return null for non-existent ID', () => {
    const result = engine.movePlanItem('nonexistent-id', DAY_2);
    expect(result).toBeNull();
  });

  it('should emit events with fromDay', () => {
    const item = engine.addPlanItem(makePlanItemInput({ day: DAY_1 }));

    const events: EngineEvent[] = [];
    engine.subscribe((e) => events.push(e));

    engine.movePlanItem(item.planItemId, DAY_2);

    const planEvents = events.filter((e) => e.type === 'PLAN_CHANGED');
    expect(planEvents).toHaveLength(1);
    expect(planEvents[0].payload.action).toBe('MOVE');
    expect(planEvents[0].payload.fromDay).toBe(DAY_1);
    expect(planEvents[0].payload.planItem.day).toBe(DAY_2);

    const stateEvents = events.filter((e) => e.type === 'STATE_CHANGED');
    expect(stateEvents).toHaveLength(1);
  });
});

// ============================================================================
// getDayPlan
// ============================================================================

describe('getDayPlan', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = createInitializedEngine();
  });

  it('should return plan for day', () => {
    engine.addPlanItem(makePlanItemInput({ day: DAY_1 }));
    const plan = engine.getDayPlan(DAY_1);

    expect(plan).not.toBeNull();
    expect(plan!.day).toBe(DAY_1);
    expect(plan!.items).toHaveLength(1);
  });

  it('should return null for empty day', () => {
    const plan = engine.getDayPlan(DAY_1);
    expect(plan).toBeNull();
  });
});

// ============================================================================
// getAllPlans
// ============================================================================

describe('getAllPlans', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = createInitializedEngine();
  });

  it('should return all day plans', () => {
    engine.addPlanItem(makePlanItemInput({ day: DAY_1 }));
    engine.addPlanItem(makePlanItemInput({ day: DAY_2, eventId: 'event-2' }));

    const plans = engine.getAllPlans();
    expect(plans).toHaveLength(2);
    const days = plans.map((p) => p.day).sort();
    expect(days).toEqual([DAY_1, DAY_2]);
  });

  it('should return empty array initially', () => {
    const plans = engine.getAllPlans();
    expect(plans).toEqual([]);
  });
});

// ============================================================================
// Lifecycle: Plans and init/update
// ============================================================================

describe('Plan lifecycle', () => {
  it('should clear plans on fresh init()', () => {
    const engine = createInitializedEngine();
    engine.addPlanItem(makePlanItemInput());
    expect(engine.getAllPlans()).toHaveLength(1);

    // Re-init should clear plans
    engine.init(makeBasicRecord());
    expect(engine.getAllPlans()).toEqual([]);
  });

  it('should preserve plans on updateTournamentRecord()', () => {
    const engine = createInitializedEngine();
    engine.addPlanItem(makePlanItemInput());
    expect(engine.getAllPlans()).toHaveLength(1);

    // updateTournamentRecord should preserve plans
    engine.updateTournamentRecord(makeBasicRecord());
    expect(engine.getAllPlans()).toHaveLength(1);
    expect(engine.getDayPlan(DAY_1)).not.toBeNull();
  });

  it('should survive snapshot (simulateBlocks)', () => {
    const engine = createInitializedEngine();
    engine.addPlanItem(makePlanItemInput());

    // simulateBlocks creates a snapshot internally; plans on the original engine are unchanged
    engine.simulateBlocks([]);

    expect(engine.getAllPlans()).toHaveLength(1);
    expect(engine.getDayPlan(DAY_1)!.items).toHaveLength(1);
  });
});

// ============================================================================
// Multiple items / days
// ============================================================================

describe('Multiple plan items', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = createInitializedEngine();
  });

  it('should support multiple items on same day', () => {
    engine.addPlanItem(makePlanItemInput({ eventId: 'event-1', roundNumber: 1 }));
    engine.addPlanItem(makePlanItemInput({ eventId: 'event-1', roundNumber: 2 }));
    engine.addPlanItem(makePlanItemInput({ eventId: 'event-2', roundNumber: 1 }));

    const plan = engine.getDayPlan(DAY_1);
    expect(plan).not.toBeNull();
    expect(plan!.items).toHaveLength(3);
  });

  it('should support multiple days with items', () => {
    engine.addPlanItem(makePlanItemInput({ day: DAY_1 }));
    engine.addPlanItem(makePlanItemInput({ day: DAY_2, eventId: 'event-2' }));

    expect(engine.getDayPlan(DAY_1)!.items).toHaveLength(1);
    expect(engine.getDayPlan(DAY_2)!.items).toHaveLength(1);
    expect(engine.getAllPlans()).toHaveLength(2);
  });
});
