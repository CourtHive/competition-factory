/**
 * Shadow Scheduling Tests (importScheduledMatchUps)
 *
 * Tests for importing scheduled matchUps as SCHEDULED blocks
 * and the matchUpId field on Block.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AvailabilityEngine } from '@Assemblies/engines/availability/AvailabilityEngine';
import { BLOCK_TYPES } from '@Assemblies/governors/availabilityGovernor/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const TOURNAMENT_ID = 'test-tournament';
const VENUE_ID = 'venue-1';
const COURT_1 = 'court-1';
const COURT_2 = 'court-2';

function makeBasicRecord() {
  return {
    tournamentId: TOURNAMENT_ID,
    startDate: '2026-06-15',
    endDate: '2026-06-17',
    venues: [
      {
        venueId: VENUE_ID,
        courts: [
          { courtId: COURT_1, courtName: 'Court 1' },
          { courtId: COURT_2, courtName: 'Court 2' },
        ],
      },
    ],
  };
}

// ============================================================================
// importScheduledMatchUps Tests
// ============================================================================

describe('importScheduledMatchUps', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });
  });

  it('creates SCHEDULED blocks from matchUp data', () => {
    const result = engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-1',
        courtId: COURT_1,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 90,
      },
    ]);

    expect(result.applied.length).toBeGreaterThan(0);

    const blocks = engine.getAllBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].type).toBe(BLOCK_TYPES.SCHEDULED);
    expect(blocks[0].source).toBe('SYSTEM');
    expect(blocks[0].matchUpId).toBe('mu-1');
    expect(blocks[0].start).toBe('2026-06-15T10:00:00');
    expect(blocks[0].end).toBe('2026-06-15T11:30:00');
  });

  it('creates multiple blocks for multiple matchUps', () => {
    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-1',
        courtId: COURT_1,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 60,
      },
      {
        matchUpId: 'mu-2',
        courtId: COURT_2,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 90,
      },
    ]);

    const blocks = engine.getAllBlocks();
    expect(blocks).toHaveLength(2);

    const mu1 = blocks.find((b) => b.matchUpId === 'mu-1');
    const mu2 = blocks.find((b) => b.matchUpId === 'mu-2');
    expect(mu1).toBeDefined();
    expect(mu2).toBeDefined();
    expect(mu1!.court.courtId).toBe(COURT_1);
    expect(mu2!.court.courtId).toBe(COURT_2);
  });

  it('clears existing SCHEDULED SYSTEM blocks before importing', () => {
    // First import
    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-old',
        courtId: COURT_1,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '08:00',
        durationMinutes: 60,
      },
    ]);

    expect(engine.getAllBlocks()).toHaveLength(1);
    expect(engine.getAllBlocks()[0].matchUpId).toBe('mu-old');

    // Second import should replace
    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-new',
        courtId: COURT_2,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '14:00',
        durationMinutes: 120,
      },
    ]);

    const blocks = engine.getAllBlocks();
    expect(blocks).toHaveLength(1);
    expect(blocks[0].matchUpId).toBe('mu-new');
    expect(blocks[0].court.courtId).toBe(COURT_2);
  });

  it('preserves non-SCHEDULED or non-SYSTEM blocks', () => {
    // Create a user block first
    engine.applyBlock({
      courts: [{ tournamentId: TOURNAMENT_ID, venueId: VENUE_ID, courtId: COURT_1 }],
      timeRange: { start: '2026-06-15T08:00:00', end: '2026-06-15T09:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
      source: 'USER',
    });

    expect(engine.getAllBlocks()).toHaveLength(1);

    // Import should not remove the MAINTENANCE block
    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-1',
        courtId: COURT_2,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 60,
      },
    ]);

    const blocks = engine.getAllBlocks();
    expect(blocks).toHaveLength(2);
    expect(blocks.some((b) => b.type === BLOCK_TYPES.MAINTENANCE)).toBe(true);
    expect(blocks.some((b) => b.type === BLOCK_TYPES.SCHEDULED)).toBe(true);
  });

  it('handles HH:MM:SS format for startTime', () => {
    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-1',
        courtId: COURT_1,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '10:30:00',
        durationMinutes: 45,
      },
    ]);

    const blocks = engine.getAllBlocks();
    expect(blocks[0].start).toBe('2026-06-15T10:30:00');
    expect(blocks[0].end).toBe('2026-06-15T11:15:00');
  });

  it('handles empty matchUps array (clears existing scheduled)', () => {
    // First import
    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-1',
        courtId: COURT_1,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 60,
      },
    ]);

    expect(engine.getAllBlocks()).toHaveLength(1);

    // Empty import clears
    engine.importScheduledMatchUps([]);

    expect(engine.getAllBlocks()).toHaveLength(0);
  });

  it('emits BLOCKS_CHANGED and STATE_CHANGED events', () => {
    const events: any[] = [];
    engine.subscribe((e) => events.push(e));

    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-1',
        courtId: COURT_1,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 60,
      },
    ]);

    expect(events.some((e) => e.type === 'BLOCKS_CHANGED')).toBe(true);
    expect(events.some((e) => e.type === 'STATE_CHANGED')).toBe(true);
  });

  it('returns MutationResult with applied mutations', () => {
    const result = engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-1',
        courtId: COURT_1,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 60,
      },
    ]);

    expect(result.applied.length).toBeGreaterThan(0);
    expect(result.applied.some((m) => m.kind === 'ADD_BLOCK')).toBe(true);
  });

  it('sets correct court reference on created blocks', () => {
    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-1',
        courtId: COURT_1,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 60,
      },
    ]);

    const block = engine.getAllBlocks()[0];
    expect(block.court.tournamentId).toBe(TOURNAMENT_ID);
    expect(block.court.venueId).toBe(VENUE_ID);
    expect(block.court.courtId).toBe(COURT_1);
  });
});

// ============================================================================
// matchUpId on Block interface
// ============================================================================

describe('Block matchUpId field', () => {
  it('blocks created via applyBlock have no matchUpId', () => {
    const engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    engine.applyBlock({
      courts: [{ tournamentId: TOURNAMENT_ID, venueId: VENUE_ID, courtId: COURT_1 }],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    const block = engine.getAllBlocks()[0];
    expect(block.matchUpId).toBeUndefined();
  });

  it('blocks from importScheduledMatchUps have matchUpId set', () => {
    const engine = new AvailabilityEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu-123',
        courtId: COURT_1,
        venueId: VENUE_ID,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 60,
      },
    ]);

    const block = engine.getAllBlocks()[0];
    expect(block.matchUpId).toBe('mu-123');
  });
});
