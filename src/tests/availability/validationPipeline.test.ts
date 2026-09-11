/**
 * Validation Pipeline Tests
 *
 * Tests for the multi-phase validation system that checks
 * scheduling plans against engine state.
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { AvailabilityEngine } from '@Assemblies/engines/availability/AvailabilityEngine';
import { runValidationPipeline } from '@Assemblies/governors/availabilityGovernor/validationPipeline';
import type { ValidationPhase } from '@Assemblies/governors/availabilityGovernor/validationPipeline';

// ============================================================================
// Test Fixtures
// ============================================================================

const TOURNAMENT_ID = 'test-tournament';
const VENUE_ID = 'venue-1';

function makeBasicRecord() {
  return {
    tournamentId: TOURNAMENT_ID,
    startDate: '2026-06-15',
    endDate: '2026-06-17',
    venues: [
      {
        venueId: VENUE_ID,
        courts: [
          { courtId: 'court-1', courtName: 'Court 1' },
          { courtId: 'court-2', courtName: 'Court 2' },
        ],
      },
    ],
  };
}

function initEngine() {
  const engine = new AvailabilityEngine();
  engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });
  return engine;
}

// ============================================================================
// Pipeline Basics
// ============================================================================

describe('runValidationPipeline', () => {
  it('returns empty results when no plans exist', () => {
    const engine = initEngine();
    const { results, issueIndex } = runValidationPipeline({ engine });
    expect(results).toHaveLength(0);
    expect(issueIndex.size).toBe(0);
  });

  it('returns results for a specific day when day param provided', () => {
    const engine = initEngine();
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
    });
    engine.addPlanItem({
      day: '2026-06-16',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 2,
    });

    // Only validate day 15
    const { results } = runValidationPipeline({ engine, day: '2026-06-15' });
    // Should only see results related to day 15
    const dayContexts = results.filter((r) => r.context?.day).map((r) => r.context!.day);
    expect(dayContexts.every((d) => d === '2026-06-15')).toBe(true);
  });

  it('runs only specified phases', () => {
    const engine = initEngine();
    engine.addPlanItem({
      day: '2099-01-01', // Invalid day -- will trigger PRECHECK
      venueId: 'invalid-venue',
      eventId: 'event-1',
      roundNumber: 1,
    });

    const phases: ValidationPhase[] = ['INTEGRITY'];
    const { results } = runValidationPipeline({ engine, phases });
    // Should only have INTEGRITY phase results
    expect(results.every((r) => r.phase === 'INTEGRITY')).toBe(true);
  });

  it('builds issueIndex keyed by planItemId', () => {
    const engine = initEngine();
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: 'nonexistent-venue',
      eventId: 'event-1',
      roundNumber: 1,
    });

    const { issueIndex } = runValidationPipeline({ engine });
    expect(issueIndex.size).toBeGreaterThan(0);
  });
});

// ============================================================================
// PRECHECK Phase
// ============================================================================

describe('PRECHECK validators', () => {
  let engine: AvailabilityEngine;

  beforeEach(() => {
    engine = initEngine();
  });

  it('detects invalid day (outside tournament range)', () => {
    engine.addPlanItem({
      day: '2099-01-01',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
    });

    const { results } = runValidationPipeline({ engine, phases: ['PRECHECK'] });
    expect(results.some((r) => r.ruleId === 'PRECHECK_INVALID_DAY')).toBe(true);
    expect(results.find((r) => r.ruleId === 'PRECHECK_INVALID_DAY')?.severity).toBe('ERROR');
  });

  it('detects invalid venueId', () => {
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: 'nonexistent-venue',
      eventId: 'event-1',
      roundNumber: 1,
    });

    const { results } = runValidationPipeline({ engine, phases: ['PRECHECK'] });
    expect(results.some((r) => r.ruleId === 'PRECHECK_INVALID_VENUE')).toBe(true);
  });

  it('detects invalid notBeforeTime format', () => {
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
      notBeforeTime: 'bad-time',
    });

    const { results } = runValidationPipeline({ engine, phases: ['PRECHECK'] });
    expect(results.some((r) => r.ruleId === 'PRECHECK_INVALID_TIME_FORMAT')).toBe(true);
  });

  it('detects invalid roundNumber', () => {
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 0,
    });

    const { results } = runValidationPipeline({ engine, phases: ['PRECHECK'] });
    expect(results.some((r) => r.ruleId === 'PRECHECK_INVALID_ROUND')).toBe(true);
  });

  it('passes valid plan items', () => {
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
      notBeforeTime: '10:00',
    });

    const { results } = runValidationPipeline({ engine, phases: ['PRECHECK'] });
    expect(results).toHaveLength(0);
  });

  it('stops pipeline on PRECHECK ERROR', () => {
    engine.addPlanItem({
      day: '2099-01-01', // Invalid day
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
    });

    // Run all phases -- should stop after PRECHECK due to ERROR
    const { results } = runValidationPipeline({ engine });
    expect(results.every((r) => r.phase === 'PRECHECK')).toBe(true);
  });
});

// ============================================================================
// INTEGRITY Phase
// ============================================================================

describe('INTEGRITY validators', () => {
  it('detects no issues with unique plan items', () => {
    const engine = initEngine();
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
    });
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 2,
    });

    const { results } = runValidationPipeline({ engine, phases: ['INTEGRITY'] });
    expect(results).toHaveLength(0);
  });
});

// ============================================================================
// ORDERING Phase
// ============================================================================

describe('ORDERING validators', () => {
  it('detects later round scheduled on earlier day', () => {
    const engine = initEngine();
    // Round 2 on day 15, Round 1 on day 16 -- out of order
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 2,
    });
    engine.addPlanItem({
      day: '2026-06-16',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
    });

    const { results } = runValidationPipeline({ engine, phases: ['ORDERING'] });
    expect(results.some((r) => r.ruleId === 'ORDERING_ROUND_DAY_SEQUENCE')).toBe(true);
    expect(results[0].severity).toBe('WARN');
  });

  it('passes correctly ordered rounds', () => {
    const engine = initEngine();
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
    });
    engine.addPlanItem({
      day: '2026-06-16',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 2,
    });

    const { results } = runValidationPipeline({ engine, phases: ['ORDERING'] });
    expect(results).toHaveLength(0);
  });

  it('allows same-day rounds in any order', () => {
    const engine = initEngine();
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
    });
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 2,
    });

    const { results } = runValidationPipeline({ engine, phases: ['ORDERING'] });
    expect(results).toHaveLength(0);
  });

  it('includes fixAction with suggested day', () => {
    const engine = initEngine();
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 2,
    });
    engine.addPlanItem({
      day: '2026-06-16',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
    });

    const { results } = runValidationPipeline({ engine, phases: ['ORDERING'] });
    const orderResult = results.find((r) => r.ruleId === 'ORDERING_ROUND_DAY_SEQUENCE');
    expect(orderResult?.fixAction).toBeDefined();
    expect(orderResult?.fixAction?.type).toBe('MOVE_PLAN_ITEM');
  });

  it('checks ordering per event independently', () => {
    const engine = initEngine();
    // Event 1: round 1 on day 15, round 2 on day 16 (correct)
    engine.addPlanItem({ day: '2026-06-15', venueId: VENUE_ID, eventId: 'event-1', roundNumber: 1 });
    engine.addPlanItem({ day: '2026-06-16', venueId: VENUE_ID, eventId: 'event-1', roundNumber: 2 });
    // Event 2: round 1 on day 16, round 2 on day 15 (out of order)
    engine.addPlanItem({ day: '2026-06-16', venueId: VENUE_ID, eventId: 'event-2', roundNumber: 1 });
    engine.addPlanItem({ day: '2026-06-15', venueId: VENUE_ID, eventId: 'event-2', roundNumber: 2 });

    const { results } = runValidationPipeline({ engine, phases: ['ORDERING'] });
    // Only event-2 should have ordering issues
    expect(results).toHaveLength(1);
  });
});

// ============================================================================
// CAPACITY Phase
// ============================================================================

describe('CAPACITY validators', () => {
  it('warns when demand exceeds available court-hours', () => {
    const engine = initEngine();
    // 2 courts x 17 hours = 34 court-hours = 2040 minutes
    // Add items totaling more than 2040 minutes
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
      estimatedDurationMinutes: 1200,
    });
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-2',
      roundNumber: 1,
      estimatedDurationMinutes: 1000,
    });

    const { results } = runValidationPipeline({ engine, phases: ['CAPACITY'] });
    expect(results.some((r) => r.ruleId === 'CAPACITY_DEMAND_EXCEEDS_SUPPLY')).toBe(true);
  });

  it('shows info when demand is near capacity (>90%)', () => {
    const engine = initEngine();
    // 2 courts x 17 hours = 2040 minutes. 90% = 1836 minutes.
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
      estimatedDurationMinutes: 1900,
    });

    const { results } = runValidationPipeline({ engine, phases: ['CAPACITY'] });
    expect(results.some((r) => r.ruleId === 'CAPACITY_NEAR_LIMIT')).toBe(true);
    expect(results.find((r) => r.ruleId === 'CAPACITY_NEAR_LIMIT')?.severity).toBe('INFO');
  });

  it('passes when demand is well within capacity', () => {
    const engine = initEngine();
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
      estimatedDurationMinutes: 120,
    });

    const { results } = runValidationPipeline({ engine, phases: ['CAPACITY'] });
    expect(results).toHaveLength(0);
  });

  it('skips capacity check when no items have estimatedDuration', () => {
    const engine = initEngine();
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: VENUE_ID,
      eventId: 'event-1',
      roundNumber: 1,
    });

    const { results } = runValidationPipeline({ engine, phases: ['CAPACITY'] });
    expect(results).toHaveLength(0);
  });
});
