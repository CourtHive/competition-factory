/**
 * Availability Engine Tests
 *
 * Comprehensive test suite for the AvailabilityEngine class covering:
 * - Engine Lifecycle (init, config defaults, updateTournamentRecord)
 * - Tournament Days
 * - Block CRUD (applyBlock, moveBlock, resizeBlock, removeBlock)
 * - Queries (getDayTimeline, getVenueTimeline, getCourtRail, getDayBlocks, getAllBlocks)
 * - Event System (subscribe, unsubscribe, multiple subscribers)
 * - Simulation (simulateBlocks)
 * - Tournament Record Loading (bookings, availability, bookingType mapping)
 * - Court Metadata (listCourtMeta)
 * - Conflict Evaluators integration
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AvailabilityEngine } from '@Assemblies/engines/availability/AvailabilityEngine';
import {
  BLOCK_TYPES,
  type Block,
  type BlockMutation,
  type ConflictEvaluator,
  type CourtRef,
  type EngineEvent,
} from '@Assemblies/governors/availabilityGovernor/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_TOURNAMENT = 'test-tournament';
const TEST_VENUE = 'venue-1';
const COURT_1 = 'court-1';
const COURT_2 = 'court-2';

function makeCourtRef(courtId = COURT_1): CourtRef {
  return { tournamentId: TEST_TOURNAMENT, venueId: TEST_VENUE, courtId };
}

function makeBasicRecord() {
  return {
    tournamentId: TEST_TOURNAMENT,
    startDate: '2026-06-15',
    endDate: '2026-06-17',
    venues: [
      {
        venueId: TEST_VENUE,
        courts: [
          {
            courtId: COURT_1,
            courtName: 'Court 1',
            surfaceCategory: 'clay',
            indoorOutdoor: 'OUTDOOR',
            hasLights: true,
          },
          {
            courtId: COURT_2,
            courtName: 'Court 2',
            surfaceCategory: 'hard',
            indoorOutdoor: 'INDOOR',
            hasLights: false,
          },
        ],
      },
    ],
  };
}

// ============================================================================
// 1. Engine Lifecycle
// ============================================================================

describe('Engine Lifecycle', () => {
  it('should init with a minimal tournament record', () => {
    const engine = new AvailabilityEngine();
    engine.init({ tournamentId: TEST_TOURNAMENT });

    const config = engine.getConfig();
    expect(config.tournamentId).toBe(TEST_TOURNAMENT);
  });

  it('should init with full config overrides', () => {
    const engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), {
      tournamentId: 'custom-id',
      dayStartTime: '08:00',
      dayEndTime: '20:00',
      slotMinutes: 30,
    });

    const config = engine.getConfig();
    expect(config.tournamentId).toBe('custom-id');
    expect(config.dayStartTime).toBe('08:00');
    expect(config.dayEndTime).toBe('20:00');
    expect(config.slotMinutes).toBe(30);
  });

  it('should use correct default config values', () => {
    const engine = new AvailabilityEngine();
    engine.init(makeBasicRecord());

    const config = engine.getConfig();
    expect(config.dayStartTime).toBe('06:00');
    expect(config.dayEndTime).toBe('23:00');
    expect(config.slotMinutes).toBe(15);
  });

  it('should use tournamentId from record when not in config', () => {
    const engine = new AvailabilityEngine();
    engine.init(makeBasicRecord());

    const config = engine.getConfig();
    expect(config.tournamentId).toBe(TEST_TOURNAMENT);
  });

  it('should replace blocks on updateTournamentRecord', () => {
    const engine = new AvailabilityEngine();
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        bookings: [{ startTime: '10:00', endTime: '11:00', bookingType: 'PRACTICE' }],
      },
    ];
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    const blocksBefore = engine.getAllBlocks();
    expect(blocksBefore.length).toBeGreaterThan(0);

    // Update with a record that has no bookings
    engine.updateTournamentRecord(makeBasicRecord());
    const blocksAfter = engine.getAllBlocks();
    expect(blocksAfter).toHaveLength(0);
  });

  it('should emit STATE_CHANGED event on init', () => {
    const engine = new AvailabilityEngine();
    const events: EngineEvent[] = [];
    engine.subscribe((e) => events.push(e));
    engine.init(makeBasicRecord());

    const stateChanged = events.find((e) => e.type === 'STATE_CHANGED');
    expect(stateChanged).toBeTruthy();
    expect(stateChanged!.payload.reason).toBe('INIT');
  });

  it('should emit STATE_CHANGED on updateTournamentRecord', () => {
    const engine = new AvailabilityEngine();
    engine.init(makeBasicRecord());

    const events: EngineEvent[] = [];
    engine.subscribe((e) => events.push(e));

    engine.updateTournamentRecord(makeBasicRecord());
    const stateChanged = events.find(
      (e) => e.type === 'STATE_CHANGED' && e.payload.reason === 'TOURNAMENT_RECORD_UPDATED',
    );
    expect(stateChanged).toBeTruthy();
  });
});

// ============================================================================
// 2. Tournament Days
// ============================================================================

describe('Tournament Days', () => {
  it('should return days from startDate to endDate', () => {
    const engine = new AvailabilityEngine();
    engine.init(makeBasicRecord());

    const days = engine.getTournamentDays();
    expect(days).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
  });

  it('should handle single-day tournament', () => {
    const engine = new AvailabilityEngine();
    engine.init({
      tournamentId: TEST_TOURNAMENT,
      startDate: '2026-06-15',
      endDate: '2026-06-15',
      venues: [],
    });

    const days = engine.getTournamentDays();
    expect(days).toEqual(['2026-06-15']);
  });

  it('should return empty array when no startDate', () => {
    const engine = new AvailabilityEngine();
    engine.init({ tournamentId: TEST_TOURNAMENT, venues: [] });

    const days = engine.getTournamentDays();
    expect(days).toEqual([]);
  });

  it('should use startDate as endDate when endDate not set', () => {
    const engine = new AvailabilityEngine();
    engine.init({
      tournamentId: TEST_TOURNAMENT,
      startDate: '2026-06-15',
      venues: [],
    });

    const days = engine.getTournamentDays();
    expect(days).toEqual(['2026-06-15']);
  });
});

// ============================================================================
// 3. Block CRUD
// ============================================================================

describe('Block CRUD', () => {
  let engine: AvailabilityEngine;
  let events: EngineEvent[];

  beforeEach(() => {
    engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });
    events = [];
    engine.subscribe((e) => events.push(e));
  });

  it('should create a block via applyBlock and index it', () => {
    const result = engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
      reason: 'Court resurfacing',
    });

    expect(result.applied).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);

    const blocks = engine.getAllBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe(BLOCK_TYPES.MAINTENANCE);
    expect(blocks[0].reason).toBe('Court resurfacing');
    expect(blocks[0].court.courtId).toBe(COURT_1);
  });

  it('should clamp block to court availability', () => {
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', {
      startTime: '09:00',
      endTime: '17:00',
    });

    const result = engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T07:00:00', end: '2026-06-15T20:00:00' },
      type: BLOCK_TYPES.BLOCKED,
    });

    expect(result.applied).toHaveLength(1);
    const block = engine.getAllBlocks()[0];
    expect(block.start).toBe('2026-06-15T09:00:00');
    expect(block.end).toBe('2026-06-15T17:00:00');
  });

  it('should apply block to multiple courts', () => {
    const result = engine.applyBlock({
      courts: [makeCourtRef(COURT_1), makeCourtRef(COURT_2)],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T11:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });

    expect(result.applied).toHaveLength(2);
    const blocks = engine.getAllBlocks();
    expect(blocks).toHaveLength(2);

    const courtIds = blocks.map((b) => b.court.courtId).sort();
    expect(courtIds).toEqual([COURT_1, COURT_2]);
  });

  it('should move a block to a new time', () => {
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    const blockId = engine.getAllBlocks()[0].id;

    const result = engine.moveBlock({
      blockId,
      newTimeRange: { start: '2026-06-15T14:00:00', end: '2026-06-15T16:00:00' },
    });

    expect(result.applied).toHaveLength(1);
    const movedBlock = engine.getAllBlocks()[0];
    expect(movedBlock.start).toBe('2026-06-15T14:00:00');
    expect(movedBlock.end).toBe('2026-06-15T16:00:00');
  });

  it('should move a block to a new court', () => {
    engine.applyBlock({
      courts: [makeCourtRef(COURT_1)],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });

    const blockId = engine.getAllBlocks()[0].id;

    const result = engine.moveBlock({
      blockId,
      newTimeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      newCourt: makeCourtRef(COURT_2),
    });

    expect(result.applied).toHaveLength(1);
    const movedBlock = engine.getAllBlocks()[0];
    expect(movedBlock.court.courtId).toBe(COURT_2);
  });

  it('should return warning when moveBlock targets non-existent blockId', () => {
    const result = engine.moveBlock({
      blockId: 'non-existent',
      newTimeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
    });

    expect(result.applied).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('BLOCK_NOT_FOUND');
  });

  it('should resize a block', () => {
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    const blockId = engine.getAllBlocks()[0].id;

    const result = engine.resizeBlock({
      blockId,
      newTimeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T14:00:00' },
    });

    expect(result.applied).toHaveLength(1);
    const resized = engine.getAllBlocks()[0];
    expect(resized.end).toBe('2026-06-15T14:00:00');
  });

  it('should clamp resizeBlock to availability', () => {
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', {
      startTime: '09:00',
      endTime: '17:00',
    });

    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.BLOCKED,
    });

    const blockId = engine.getAllBlocks()[0].id;

    const result = engine.resizeBlock({
      blockId,
      newTimeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T20:00:00' },
    });

    expect(result.applied).toHaveLength(1);
    const resized = engine.getAllBlocks()[0];
    expect(resized.end).toBe('2026-06-15T17:00:00');
  });

  it('should remove a block', () => {
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    const blockId = engine.getAllBlocks()[0].id;
    const result = engine.removeBlock(blockId);

    expect(result.applied).toHaveLength(1);
    expect(engine.getAllBlocks()).toHaveLength(0);
  });

  it('should return warning when removeBlock targets non-existent blockId', () => {
    const result = engine.removeBlock('non-existent');

    expect(result.applied).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('BLOCK_NOT_FOUND');
  });

  it('should emit BLOCKS_CHANGED on mutation', () => {
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    const blocksChanged = events.find((e) => e.type === 'BLOCKS_CHANGED');
    expect(blocksChanged).toBeTruthy();
    expect(blocksChanged!.payload.mutations).toHaveLength(1);
  });

  it('should emit STATE_CHANGED with BLOCKS_MUTATED reason on mutation', () => {
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    const stateChanged = events.find((e) => e.type === 'STATE_CHANGED' && e.payload.reason === 'BLOCKS_MUTATED');
    expect(stateChanged).toBeTruthy();
  });
});

// ============================================================================
// 4. Queries
// ============================================================================

describe('Queries', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });
  });

  it('getDayTimeline should group courts by venue', () => {
    const timelines = engine.getDayTimeline('2026-06-15');
    expect(timelines).toHaveLength(1);
    expect(timelines[0].venueId).toBe(TEST_VENUE);
    expect(timelines[0].rails).toHaveLength(2);
  });

  it('getVenueTimeline should return timeline for specific venue', () => {
    const timeline = engine.getVenueTimeline('2026-06-15', TEST_VENUE);
    expect(timeline).toBeTruthy();
    expect(timeline!.venueId).toBe(TEST_VENUE);
    expect(timeline!.day).toBe('2026-06-15');
  });

  it('getVenueTimeline should return null for non-existent venue', () => {
    const timeline = engine.getVenueTimeline('2026-06-15', 'non-existent-venue');
    expect(timeline).toBeNull();
  });

  it('getCourtRail should return rail with segments', () => {
    const rail = engine.getCourtRail('2026-06-15', makeCourtRef());
    expect(rail).toBeTruthy();
    expect(rail!.court.courtId).toBe(COURT_1);
    expect(rail!.segments.length).toBeGreaterThan(0);
    // With no blocks, entire day should be AVAILABLE
    expect(rail!.segments[0].status).toBe(BLOCK_TYPES.AVAILABLE);
  });

  it('getCourtRail should reflect applied blocks', () => {
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    const rail = engine.getCourtRail('2026-06-15', makeCourtRef());
    expect(rail).toBeTruthy();
    const maintenanceSegment = rail!.segments.find((s) => s.status === BLOCK_TYPES.MAINTENANCE);
    expect(maintenanceSegment).toBeTruthy();
    expect(maintenanceSegment!.start).toBe('2026-06-15T10:00:00');
    expect(maintenanceSegment!.end).toBe('2026-06-15T12:00:00');
  });

  it('getDayBlocks should filter by day', () => {
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-16T10:00:00', end: '2026-06-16T12:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });

    const day15Blocks = engine.getDayBlocks('2026-06-15');
    expect(day15Blocks).toHaveLength(1);
    expect(day15Blocks[0].type).toBe(BLOCK_TYPES.MAINTENANCE);

    const day16Blocks = engine.getDayBlocks('2026-06-16');
    expect(day16Blocks).toHaveLength(1);
    expect(day16Blocks[0].type).toBe(BLOCK_TYPES.PRACTICE);
  });

  it('getAllBlocks should return all blocks across days', () => {
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-16T10:00:00', end: '2026-06-16T12:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });

    const allBlocks = engine.getAllBlocks();
    expect(allBlocks).toHaveLength(2);
  });

  it('getAllBlocks should return empty array when no blocks', () => {
    expect(engine.getAllBlocks()).toHaveLength(0);
  });

  it('getTemplates should return empty array initially', () => {
    expect(engine.getTemplates()).toHaveLength(0);
  });

  it('getTemplate should return null for non-existent template', () => {
    expect(engine.getTemplate('non-existent')).toBeNull();
  });

  it('getRules should return empty array initially', () => {
    expect(engine.getRules()).toHaveLength(0);
  });

  it('getRule should return null for non-existent rule', () => {
    expect(engine.getRule('non-existent')).toBeNull();
  });
});

// ============================================================================
// 5. Event System
// ============================================================================

describe('Event System', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });
  });

  it('subscribe should return an unsubscribe function', () => {
    const unsubscribe = engine.subscribe(() => {});
    expect(typeof unsubscribe).toBe('function');
  });

  it('unsubscribe should stop notifications', () => {
    const events: EngineEvent[] = [];
    const unsubscribe = engine.subscribe((e) => events.push(e));

    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });
    expect(events.length).toBeGreaterThan(0);

    const countBefore = events.length;
    unsubscribe();

    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T14:00:00', end: '2026-06-15T16:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });
    expect(events.length).toBe(countBefore);
  });

  it('multiple subscribers should all be notified', () => {
    const events1: EngineEvent[] = [];
    const events2: EngineEvent[] = [];
    const events3: EngineEvent[] = [];

    engine.subscribe((e) => events1.push(e));
    engine.subscribe((e) => events2.push(e));
    engine.subscribe((e) => events3.push(e));

    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    expect(events1.length).toBeGreaterThan(0);
    expect(events2.length).toBeGreaterThan(0);
    expect(events3.length).toBeGreaterThan(0);
  });

  it('error in one subscriber should not break others', () => {
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {});

    const events1: EngineEvent[] = [];
    const events2: EngineEvent[] = [];

    engine.subscribe(() => {
      throw new Error('Subscriber error');
    });
    engine.subscribe((e) => events1.push(e));
    engine.subscribe((e) => events2.push(e));

    // Should not throw
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    expect(events1.length).toBeGreaterThan(0);
    expect(events2.length).toBeGreaterThan(0);
    expect(spy).toHaveBeenCalledWith('Error in event listener:', expect.any(Error));

    spy.mockRestore();
  });
});

// ============================================================================
// 6. Simulation
// ============================================================================

describe('Simulation', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });
  });

  it('simulateBlocks should not modify engine state', () => {
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    const blocksBeforeSimulation = engine.getAllBlocks().length;

    const newBlock: Block = {
      id: 'simulated-block',
      court: makeCourtRef(),
      start: '2026-06-15T14:00:00',
      end: '2026-06-15T16:00:00',
      type: BLOCK_TYPES.PRACTICE,
    };

    const mutation: BlockMutation = {
      kind: 'ADD_BLOCK',
      block: newBlock,
    };

    const result = engine.simulateBlocks([mutation], '2026-06-15');
    expect(result).toBeTruthy();
    expect(result.previewRails).toBeDefined();

    // Engine state should be unchanged
    expect(engine.getAllBlocks().length).toBe(blocksBeforeSimulation);
  });

  it('simulateBlocks should return preview rails', () => {
    const newBlock: Block = {
      id: 'simulated-block',
      court: makeCourtRef(),
      start: '2026-06-15T10:00:00',
      end: '2026-06-15T12:00:00',
      type: BLOCK_TYPES.MAINTENANCE,
    };

    const mutation: BlockMutation = {
      kind: 'ADD_BLOCK',
      block: newBlock,
    };

    const result = engine.simulateBlocks([mutation], '2026-06-15');
    expect(result.previewRails.length).toBeGreaterThan(0);
    expect(result.capacityImpact).toBeDefined();
  });

  it('simulateBlocks with empty mutations should succeed', () => {
    const result = engine.simulateBlocks([], '2026-06-15');
    expect(result).toBeTruthy();
    expect(result.previewRails).toBeDefined();
    expect(result.conflicts).toHaveLength(0);
  });
});

// ============================================================================
// 7. Tournament Record Loading
// ============================================================================

describe('Tournament Record Loading', () => {
  it('should load court-level bookings', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        bookings: [
          { startTime: '10:00', endTime: '11:00', bookingType: 'PRACTICE' },
          { startTime: '14:00', endTime: '15:00', bookingType: 'MAINTENANCE' },
        ],
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    const blocks = engine.getAllBlocks();
    expect(blocks).toHaveLength(2);

    const courtIds = blocks.map((b) => b.court.courtId);
    expect(courtIds.every((id) => id === COURT_1)).toBe(true);
  });

  it('should load venue-level bookings for all courts', () => {
    const record = makeBasicRecord();
    (record.venues[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        startTime: '08:00',
        endTime: '20:00',
        bookings: [{ startTime: '12:00', endTime: '13:00', bookingType: 'MAINTENANCE' }],
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    const blocks = engine.getAllBlocks();
    // Venue-level booking should create one block per court
    expect(blocks).toHaveLength(2);

    const courtIds = blocks.map((b) => b.court.courtId).sort();
    expect(courtIds).toEqual([COURT_1, COURT_2]);
    expect(blocks.every((b) => b.type === BLOCK_TYPES.MAINTENANCE)).toBe(true);
  });

  it('should map MAINTENANCE bookingType to MAINTENANCE BlockType', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        bookings: [{ startTime: '10:00', endTime: '11:00', bookingType: 'MAINTENANCE' }],
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    expect(engine.getAllBlocks()[0].type).toBe(BLOCK_TYPES.MAINTENANCE);
  });

  it('should map PRACTICE bookingType to PRACTICE BlockType', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        bookings: [{ startTime: '10:00', endTime: '11:00', bookingType: 'PRACTICE' }],
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    expect(engine.getAllBlocks()[0].type).toBe(BLOCK_TYPES.PRACTICE);
  });

  it('should map MATCH bookingType to SCHEDULED BlockType', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        bookings: [{ startTime: '10:00', endTime: '11:00', bookingType: 'MATCH' }],
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    expect(engine.getAllBlocks()[0].type).toBe(BLOCK_TYPES.SCHEDULED);
  });

  // BLOCKED is what TMX's generic "block N rows" pills write — by far the most
  // common booking type in practice. It was missing from BOOKING_TYPE_MAP, so
  // every one of those blocks silently arrived as RESERVED ("reserved for
  // recreational/paying players"), a different meaning in a different
  // precedence slot.
  it('should map BLOCKED bookingType to BLOCKED BlockType', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        bookings: [{ startTime: '10:00', endTime: '11:00', bookingType: 'BLOCKED' }],
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    expect(engine.getAllBlocks()[0].type).toBe(BLOCK_TYPES.BLOCKED);
  });

  it('should map CLOSED bookingType to CLOSED BlockType', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        bookings: [{ startTime: '10:00', endTime: '11:00', bookingType: 'CLOSED' }],
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    expect(engine.getAllBlocks()[0].type).toBe(BLOCK_TYPES.CLOSED);
  });

  // Unknown types fail CLOSED, not into a meaning the data never claimed. The
  // previous default was RESERVED; UNSPECIFIED would be worse still, since the
  // capacity curve ignores it and the court would read as free.
  it('should default unknown bookingType to BLOCKED and preserve the raw value', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        bookings: [{ startTime: '10:00', endTime: '11:00', bookingType: 'UNKNOWN_TYPE' }],
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    const block = engine.getAllBlocks()[0];
    expect(block.type).toBe(BLOCK_TYPES.BLOCKED);
    // the original string is never lost — it survives on `reason`
    expect(block.reason).toBe('UNKNOWN_TYPE');
  });

  it('should load court dateAvailability times', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        startTime: '09:00',
        endTime: '18:00',
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    expect(avail.startTime).toBe('09:00');
    expect(avail.endTime).toBe('18:00');
  });

  it('should handle 5-char time formats (HH:MM to HH:MM:SS)', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        bookings: [{ startTime: '10:00', endTime: '11:30', bookingType: 'PRACTICE' }],
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    const block = engine.getAllBlocks()[0];
    // 5-char time format should be expanded to include seconds
    expect(block.start).toBe('2026-06-15T10:00:00');
    expect(block.end).toBe('2026-06-15T11:30:00');
  });

  it('should handle 8-char time formats (HH:MM:SS) without modification', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).dateAvailability = [
      {
        date: '2026-06-15',
        bookings: [{ startTime: '10:00:00', endTime: '11:30:00', bookingType: 'PRACTICE' }],
      },
    ];

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    const block = engine.getAllBlocks()[0];
    expect(block.start).toBe('2026-06-15T10:00:00');
    expect(block.end).toBe('2026-06-15T11:30:00');
  });

  it('should handle record with no venues gracefully', () => {
    const engine = new AvailabilityEngine();
    engine.init({ tournamentId: TEST_TOURNAMENT, startDate: '2026-06-15' });

    expect(engine.getAllBlocks()).toHaveLength(0);
  });
});

// ============================================================================
// 8. Court Metadata
// ============================================================================

describe('Court Metadata', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });
  });

  it('listCourtMeta should return all courts', () => {
    const meta = engine.listCourtMeta();
    expect(meta).toHaveLength(2);

    const courtIds = meta.map((m) => m.ref.courtId).sort();
    expect(courtIds).toEqual([COURT_1, COURT_2]);
  });

  it('courtMeta should include surface from record', () => {
    const meta = engine.listCourtMeta();
    const court1Meta = meta.find((m) => m.ref.courtId === COURT_1);
    const court2Meta = meta.find((m) => m.ref.courtId === COURT_2);

    expect(court1Meta!.surface).toBe('clay');
    expect(court2Meta!.surface).toBe('hard');
  });

  it('courtMeta should include indoor flag from record', () => {
    const meta = engine.listCourtMeta();
    const court1Meta = meta.find((m) => m.ref.courtId === COURT_1);
    const court2Meta = meta.find((m) => m.ref.courtId === COURT_2);

    expect(court1Meta!.indoor).toBe(false); // OUTDOOR
    expect(court2Meta!.indoor).toBe(true); // INDOOR
  });

  it('courtMeta should include hasLights from record', () => {
    const meta = engine.listCourtMeta();
    const court1Meta = meta.find((m) => m.ref.courtId === COURT_1);
    const court2Meta = meta.find((m) => m.ref.courtId === COURT_2);

    expect(court1Meta!.hasLights).toBe(true);
    expect(court2Meta!.hasLights).toBe(false);
  });

  it('courtMeta should include court name', () => {
    const meta = engine.listCourtMeta();
    const court1Meta = meta.find((m) => m.ref.courtId === COURT_1);
    expect(court1Meta!.name).toBe('Court 1');
  });

  it('listCourtMeta should return empty array for record with no venues', () => {
    const engine2 = new AvailabilityEngine();
    engine2.init({ tournamentId: TEST_TOURNAMENT });
    expect(engine2.listCourtMeta()).toHaveLength(0);
  });
});

// ============================================================================
// 8b. Disabled venues and courts
//
// The engine must agree with `query/venues/venuesAndCourtsGetter` — the reader
// the scheduler uses. Previously the engine iterated `venue.courts` raw, so a
// disabled court was invisible to the scheduler but visible here: two readers,
// two answers, same record.
// ============================================================================

describe('Disabled venues and courts', () => {
  const DAY = '2026-06-15';

  it('should exclude a court disabled outright', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).disabled = true;

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    expect(engine.listCourtMeta().map((m) => m.ref.courtId)).toEqual([COURT_2]);
  });

  it('should exclude every court of a disabled venue', () => {
    const record = makeBasicRecord();
    (record.venues[0] as any).disabled = true;

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    expect(engine.listCourtMeta()).toHaveLength(0);
  });

  it('should honour date-scoped disabling for the day being queried', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).disabled = { dates: [DAY] };

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    // COURT_1 is disabled on DAY, so only COURT_2 appears in that day's timeline
    const timeline = engine.getDayTimeline(DAY);
    const courtIds = timeline.flatMap((v) => v.rails.map((r) => r.court.courtId));
    expect(courtIds).toEqual([COURT_2]);
  });

  it('should not exclude a date-scoped disabled court on other days', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).disabled = { dates: [DAY] };

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    const timeline = engine.getDayTimeline('2026-06-16');
    const courtIds = timeline.flatMap((v) => v.rails.map((r) => r.court.courtId)).sort();
    expect(courtIds).toEqual([COURT_1, COURT_2]);
  });

  it('should keep date-scoped disabled courts when no day context is available', () => {
    const record = makeBasicRecord();
    (record.venues[0].courts[0] as any).disabled = { dates: [DAY] };

    const engine = new AvailabilityEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    // listCourtMeta() has no day, so only a blanket `disabled: true` excludes —
    // matching the getter's behaviour when no dates are supplied.
    expect(engine.listCourtMeta()).toHaveLength(2);
  });
});

// ============================================================================
// 9. Conflict Evaluators
// ============================================================================

describe('Conflict Evaluators', () => {
  it('should reject mutation when evaluator returns ERROR-severity conflict', () => {
    const rejectingEvaluator: ConflictEvaluator = {
      id: 'ALWAYS_REJECT',
      description: 'Always rejects mutations with ERROR severity',
      evaluate: (_ctx, mutations) =>
        mutations.map((m) => ({
          code: 'ALWAYS_REJECT',
          message: 'Mutation rejected by test evaluator',
          severity: 'ERROR' as const,
          timeRange: { start: m.block.start, end: m.block.end },
          courts: [m.block.court],
        })),
    };

    const engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), {
      tournamentId: TEST_TOURNAMENT,
      conflictEvaluators: [rejectingEvaluator],
    });

    const result = engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    expect(result.applied).toHaveLength(0);
    expect(result.rejected).toHaveLength(1);
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].severity).toBe('ERROR');

    // Block should not have been added
    expect(engine.getAllBlocks()).toHaveLength(0);
  });

  it('should apply mutation with WARN-severity conflict and include warnings', () => {
    const warningEvaluator: ConflictEvaluator = {
      id: 'ALWAYS_WARN',
      description: 'Always warns on mutations with WARN severity',
      evaluate: (_ctx, mutations) =>
        mutations.map((m) => ({
          code: 'ALWAYS_WARN',
          message: 'Warning from test evaluator',
          severity: 'WARN' as const,
          timeRange: { start: m.block.start, end: m.block.end },
          courts: [m.block.court],
        })),
    };

    const engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), {
      tournamentId: TEST_TOURNAMENT,
      conflictEvaluators: [warningEvaluator],
    });

    const result = engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    expect(result.applied).toHaveLength(1);
    expect(result.rejected).toHaveLength(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('ALWAYS_WARN');
    expect(result.conflicts).toHaveLength(1);
    expect(result.conflicts[0].severity).toBe('WARN');

    // Block should have been added despite the warning
    expect(engine.getAllBlocks()).toHaveLength(1);
  });

  it('should emit CONFLICTS_CHANGED when there are conflicts', () => {
    const warningEvaluator: ConflictEvaluator = {
      id: 'ALWAYS_WARN',
      description: 'Warns on all mutations',
      evaluate: (_ctx, mutations) =>
        mutations.map((m) => ({
          code: 'WARN_TEST',
          message: 'Warning',
          severity: 'WARN' as const,
          timeRange: { start: m.block.start, end: m.block.end },
          courts: [m.block.court],
        })),
    };

    const engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), {
      tournamentId: TEST_TOURNAMENT,
      conflictEvaluators: [warningEvaluator],
    });

    const events: EngineEvent[] = [];
    engine.subscribe((e) => events.push(e));

    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    const conflictsEvent = events.find((e) => e.type === 'CONFLICTS_CHANGED');
    expect(conflictsEvent).toBeTruthy();
    expect(conflictsEvent!.payload.conflicts.length).toBeGreaterThan(0);
  });
});
