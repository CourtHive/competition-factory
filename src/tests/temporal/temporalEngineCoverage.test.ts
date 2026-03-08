/* eslint-disable sonarjs/no-duplicate-string */
import { BLOCK_TYPES, type CourtRef } from '@Assemblies/governors/temporalGovernor/types';
import { TemporalEngine } from '@Assemblies/engines/temporal/TemporalEngine';
import { describe, it, expect, beforeEach, vi } from 'vitest';

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

describe('TemporalEngine availability resolution', () => {
  it('intersects court and venue availability', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    // Set court avail: 08:00-20:00
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '08:00', endTime: '20:00' });
    // Set venue avail: 10:00-22:00
    engine.setVenueDayAvailability(TEST_TOURNAMENT, TEST_VENUE, '2026-06-15', { startTime: '10:00', endTime: '22:00' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    // Intersection: max(08:00, 10:00) = 10:00, min(20:00, 22:00) = 20:00
    expect(avail.startTime).toBe('10:00');
    expect(avail.endTime).toBe('20:00');
  });

  it('falls back to venue when intersection is empty', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    // Court: 18:00-20:00, Venue: 08:00-10:00 -> no overlap
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '18:00', endTime: '20:00' });
    engine.setVenueDayAvailability(TEST_TOURNAMENT, TEST_VENUE, '2026-06-15', { startTime: '08:00', endTime: '10:00' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    // Intersection empty -> use venue
    expect(avail.startTime).toBe('08:00');
    expect(avail.endTime).toBe('10:00');
  });

  it('uses court-only when no venue availability set', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '09:00', endTime: '17:00' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    expect(avail.startTime).toBe('09:00');
    expect(avail.endTime).toBe('17:00');
  });

  it('uses global default when no court or venue availability', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    engine.setAllCourtsDefaultAvailability({ startTime: '07:00', endTime: '21:00' });

    // Use a different day that has no court/venue-specific avail
    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-16');
    expect(avail.startTime).toBe('07:00');
    expect(avail.endTime).toBe('21:00');
  });

  it('falls back to engine config when nothing is set', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT, dayStartTime: '06:30', dayEndTime: '22:30' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-16');
    expect(avail.startTime).toBe('06:30');
    expect(avail.endTime).toBe('22:30');
  });

  it('setCourtAvailabilityAllDays works as DEFAULT', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    engine.setCourtAvailabilityAllDays(makeCourtRef(), { startTime: '08:30', endTime: '19:30' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-16');
    expect(avail.startTime).toBe('08:30');
    expect(avail.endTime).toBe('19:30');
  });
});

describe('TemporalEngine venue availability', () => {
  it('setVenueDefaultAvailability and getVenueAvailability', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    engine.setVenueDefaultAvailability(TEST_TOURNAMENT, TEST_VENUE, { startTime: '09:00', endTime: '18:00' });
    const avail = engine.getVenueAvailability(TEST_TOURNAMENT, TEST_VENUE);
    expect(avail).toEqual({ startTime: '09:00', endTime: '18:00' });
  });

  it('returns null when no venue availability', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const avail = engine.getVenueAvailability(TEST_TOURNAMENT, 'nonexistent');
    expect(avail).toBeNull();
  });

  it('day-specific overrides DEFAULT', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    engine.setVenueDefaultAvailability(TEST_TOURNAMENT, TEST_VENUE, { startTime: '09:00', endTime: '18:00' });
    engine.setVenueDayAvailability(TEST_TOURNAMENT, TEST_VENUE, '2026-06-15', { startTime: '10:00', endTime: '20:00' });

    const avail = engine.getVenueAvailability(TEST_TOURNAMENT, TEST_VENUE, '2026-06-15');
    expect(avail).toEqual({ startTime: '10:00', endTime: '20:00' });
  });
});

describe('TemporalEngine clearCourtAvailabilityForVenue', () => {
  it('clears court-level overrides for a venue', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    engine.setCourtAvailability(makeCourtRef(COURT_1), '2026-06-15', { startTime: '08:00', endTime: '16:00' });
    engine.setCourtAvailability(makeCourtRef(COURT_2), '2026-06-15', { startTime: '09:00', endTime: '17:00' });

    let keys1 = engine.getCourtAvailabilityKeys(makeCourtRef(COURT_1));
    expect(keys1.length).toBe(1);

    engine.clearCourtAvailabilityForVenue(TEST_TOURNAMENT, TEST_VENUE);

    keys1 = engine.getCourtAvailabilityKeys(makeCourtRef(COURT_1));
    expect(keys1.length).toBe(0);
  });
});

describe('TemporalEngine getVisibleTimeRange', () => {
  it('returns union of court availability', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    engine.setCourtAvailability(makeCourtRef(COURT_1), '2026-06-15', { startTime: '08:00', endTime: '18:00' });
    engine.setCourtAvailability(makeCourtRef(COURT_2), '2026-06-15', { startTime: '10:00', endTime: '20:00' });

    const range = engine.getVisibleTimeRange('2026-06-15');
    expect(range.startTime).toBe('08:00');
    expect(range.endTime).toBe('20:00');
  });

  it('returns config defaults when no courts', () => {
    const engine = new TemporalEngine();
    engine.init({ tournamentId: TEST_TOURNAMENT, startDate: '2026-06-15' }, { tournamentId: TEST_TOURNAMENT });

    const range = engine.getVisibleTimeRange('2026-06-15');
    expect(range.startTime).toBe('06:00');
    expect(range.endTime).toBe('23:00');
  });
});

describe('TemporalEngine getCourtSchedulingSummary', () => {
  it('classifies minutes as scheduled/available/blocked', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T11:00:00' },
      type: BLOCK_TYPES.SCHEDULED,
    });

    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T14:00:00', end: '2026-06-15T15:00:00' },
      type: BLOCK_TYPES.MAINTENANCE,
    });

    const summary = engine.getCourtSchedulingSummary(makeCourtRef());
    expect(summary.scheduledMinutes).toBeGreaterThan(0);
    expect(summary.blockedMinutes).toBeGreaterThan(0);
    expect(summary.availableMinutes).toBeGreaterThan(0);
  });
});

describe('TemporalEngine getActiveDays', () => {
  it('returns activeDates when set', () => {
    const engine = new TemporalEngine();
    const record = makeBasicRecord();
    (record as any).activeDates = ['2026-06-16', '2026-06-15'];

    engine.init(record, { tournamentId: TEST_TOURNAMENT });
    const days = engine.getActiveDays();
    expect(days).toEqual(['2026-06-15', '2026-06-16']); // sorted
  });

  it('falls back to getTournamentDays when no activeDates', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const days = engine.getActiveDays();
    expect(days).toEqual(['2026-06-15', '2026-06-16', '2026-06-17']);
  });
});

describe('TemporalEngine moveBlock', () => {
  it('returns warning for nonexistent block', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const result = engine.moveBlock({
      blockId: 'nonexistent',
      newTimeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('BLOCK_NOT_FOUND');
  });

  it('moves a block to a new time', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const applyResult = engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });
    const blockId = applyResult.applied[0].block.id;

    const result = engine.moveBlock({
      blockId,
      newTimeRange: { start: '2026-06-15T14:00:00', end: '2026-06-15T16:00:00' },
    });
    expect(result.applied).toHaveLength(1);
    const movedBlock = engine.getAllBlocks().find((b) => b.id === blockId);
    expect(movedBlock?.start).toBe('2026-06-15T14:00:00');
  });

  it('moves a block to a different court', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const applyResult = engine.applyBlock({
      courts: [makeCourtRef(COURT_1)],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });
    const blockId = applyResult.applied[0].block.id;

    const result = engine.moveBlock({
      blockId,
      newTimeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      newCourt: makeCourtRef(COURT_2),
    });
    expect(result.applied).toHaveLength(1);
    const movedBlock = engine.getAllBlocks().find((b) => b.id === blockId);
    expect(movedBlock?.court.courtId).toBe(COURT_2);
  });

  it('returns warning when move is outside availability', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), {
      tournamentId: TEST_TOURNAMENT,
      dayStartTime: '08:00',
      dayEndTime: '18:00',
    });

    const applyResult = engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });
    const blockId = applyResult.applied[0].block.id;

    // Restrict availability
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '10:00', endTime: '11:00' });

    const result = engine.moveBlock({
      blockId,
      newTimeRange: { start: '2026-06-15T19:00:00', end: '2026-06-15T21:00:00' },
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('OUTSIDE_AVAILABILITY');
  });
});

describe('TemporalEngine resizeBlock', () => {
  it('returns warning for nonexistent block', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const result = engine.resizeBlock({
      blockId: 'nonexistent',
      newTimeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T14:00:00' },
    });
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('BLOCK_NOT_FOUND');
  });

  it('resizes a block', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const applyResult = engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });
    const blockId = applyResult.applied[0].block.id;

    const result = engine.resizeBlock({
      blockId,
      newTimeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T14:00:00' },
    });
    expect(result.applied).toHaveLength(1);
    const resizedBlock = engine.getAllBlocks().find((b) => b.id === blockId);
    expect(resizedBlock?.end).toBe('2026-06-15T14:00:00');
  });

  it('returns warning when resize is outside availability', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const applyResult = engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });
    const blockId = applyResult.applied[0].block.id;

    // Restrict
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '10:00', endTime: '11:00' });

    const result = engine.resizeBlock({
      blockId,
      newTimeRange: { start: '2026-06-15T19:00:00', end: '2026-06-15T21:00:00' },
    });
    expect(result.warnings).toHaveLength(1);
  });
});

describe('TemporalEngine applyTemplate', () => {
  it('returns warning for nonexistent template', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const result = engine.applyTemplate({ templateId: 'nonexistent', days: ['2026-06-15'] } as any);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0].code).toBe('TEMPLATE_NOT_FOUND');
  });
});

describe('TemporalEngine importScheduledMatchUps', () => {
  it('imports scheduled matchUps as SCHEDULED blocks', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const result = engine.importScheduledMatchUps([
      {
        matchUpId: 'mu1',
        courtId: COURT_1,
        venueId: TEST_VENUE,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 90,
      },
    ]);

    expect(result.applied.length).toBeGreaterThan(0);
    const blocks = engine.getAllBlocks();
    expect(blocks.length).toBe(1);
    expect(blocks[0].type).toBe(BLOCK_TYPES.SCHEDULED);
    expect(blocks[0].source).toBe('SYSTEM');
  });

  it('clears existing SYSTEM SCHEDULED blocks before importing', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    // First import
    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu1',
        courtId: COURT_1,
        venueId: TEST_VENUE,
        date: '2026-06-15',
        startTime: '10:00',
        durationMinutes: 60,
      },
    ]);
    expect(engine.getAllBlocks()).toHaveLength(1);

    // Second import should clear first
    engine.importScheduledMatchUps([
      {
        matchUpId: 'mu2',
        courtId: COURT_2,
        venueId: TEST_VENUE,
        date: '2026-06-15',
        startTime: '14:00',
        durationMinutes: 90,
      },
    ]);
    expect(engine.getAllBlocks()).toHaveLength(1);
    expect(engine.getAllBlocks()[0].matchUpId).toBe('mu2');
  });

  it('handles HH:MM:SS time format', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const result = engine.importScheduledMatchUps([
      {
        matchUpId: 'mu1',
        courtId: COURT_1,
        venueId: TEST_VENUE,
        date: '2026-06-15',
        startTime: '10:00:00',
        durationMinutes: 60,
      },
    ]);
    expect(result.applied.length).toBeGreaterThan(0);
  });
});

describe('TemporalEngine getCapacityCurve', () => {
  it('returns capacity curve for a day', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });

    const curve = engine.getCapacityCurve('2026-06-15');
    expect(curve).toBeDefined();
  });
});

describe('TemporalEngine clamping', () => {
  it('clamps blocks to availability window', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), {
      tournamentId: TEST_TOURNAMENT,
      dayStartTime: '10:00',
      dayEndTime: '16:00',
    });

    // Block extends beyond availability
    const result = engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T08:00:00', end: '2026-06-15T20:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });
    expect(result.applied).toHaveLength(1);
    const block = engine.getAllBlocks()[0];
    expect(block.start).toBe('2026-06-15T10:00:00');
    expect(block.end).toBe('2026-06-15T16:00:00');
  });
});

describe('TemporalEngine granularity config', () => {
  it('uses explicit granularityMinutes', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), {
      tournamentId: TEST_TOURNAMENT,
      granularityMinutes: 30,
      slotMinutes: 15,
    });
    expect(engine.getResolvedGranularityMinutes()).toBe(30);
  });

  it('falls back to slotMinutes when granularityMinutes not set', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), {
      tournamentId: TEST_TOURNAMENT,
      slotMinutes: 20,
    });
    expect(engine.getResolvedGranularityMinutes()).toBe(20);
  });
});

describe('TemporalEngine venue-level dateAvailability loading', () => {
  it('loads venue default start/end times', () => {
    const record = makeBasicRecord();
    (record.venues[0] as any).defaultStartTime = '07:00';
    (record.venues[0] as any).defaultEndTime = '21:00';

    const engine = new TemporalEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    const avail = engine.getVenueAvailability(TEST_TOURNAMENT, TEST_VENUE);
    expect(avail).toEqual({ startTime: '07:00', endTime: '21:00' });
  });

  it('loads dateless venue dateAvailability as DEFAULT', () => {
    const record = makeBasicRecord();
    (record.venues[0] as any).dateAvailability = [
      { startTime: '08:00', endTime: '19:00' }, // no date
    ];

    const engine = new TemporalEngine();
    engine.init(record, { tournamentId: TEST_TOURNAMENT });

    const avail = engine.getVenueAvailability(TEST_TOURNAMENT, TEST_VENUE);
    expect(avail).toEqual({ startTime: '08:00', endTime: '19:00' });
  });
});

describe('TemporalEngine plan state', () => {
  let engine: TemporalEngine;

  beforeEach(() => {
    engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TEST_TOURNAMENT });
  });

  it('updatePlanItem returns null for nonexistent item', () => {
    const result = engine.updatePlanItem('nonexistent', { estimatedDurationMinutes: 60 });
    expect(result).toBeNull();
  });

  it('updatePlanItem updates an existing item', () => {
    const item = engine.addPlanItem({
      day: '2026-06-15',
      venueId: 'v1',
      eventId: 'e1',
      drawId: 'd1',
      structureId: 's1',
      roundNumber: 1,
    });

    const updated = engine.updatePlanItem(item.planItemId, { estimatedDurationMinutes: 120 });
    expect(updated).toBeTruthy();
    expect(updated?.estimatedDurationMinutes).toBe(120);
  });

  it('movePlanItem returns null for nonexistent item', () => {
    const result = engine.movePlanItem('nonexistent', '2026-06-16');
    expect(result).toBeNull();
  });

  it('movePlanItem moves item to different day', () => {
    const item = engine.addPlanItem({
      day: '2026-06-15',
      venueId: 'v1',
      eventId: 'e1',
      drawId: 'd1',
      structureId: 's1',
      roundNumber: 1,
    });

    const moved = engine.movePlanItem(item.planItemId, '2026-06-16');
    expect(moved).toBeTruthy();
    expect(moved?.day).toBe('2026-06-16');

    // Original day should be empty
    const oldDayPlan = engine.getDayPlan('2026-06-15');
    expect(oldDayPlan).toBeNull();

    // New day should have the item
    const newDayPlan = engine.getDayPlan('2026-06-16');
    expect(newDayPlan?.items).toHaveLength(1);
  });

  it('removePlanItem cleans up empty day plans', () => {
    const item = engine.addPlanItem({
      day: '2026-06-15',
      venueId: 'v1',
      eventId: 'e1',
      drawId: 'd1',
      structureId: 's1',
      roundNumber: 1,
    });

    const removed = engine.removePlanItem(item.planItemId);
    expect(removed).toBe(true);
    expect(engine.getDayPlan('2026-06-15')).toBeNull();
  });

  it('removePlanItem returns false for nonexistent item', () => {
    expect(engine.removePlanItem('nonexistent')).toBe(false);
  });

  it('getAllPlans returns all plans', () => {
    engine.addPlanItem({
      day: '2026-06-15',
      venueId: 'v1',
      eventId: 'e1',
      drawId: 'd1',
      structureId: 's1',
      roundNumber: 1,
    });
    engine.addPlanItem({
      day: '2026-06-16',
      venueId: 'v1',
      eventId: 'e1',
      drawId: 'd1',
      structureId: 's1',
      roundNumber: 2,
    });

    const plans = engine.getAllPlans();
    expect(plans).toHaveLength(2);
  });
});

describe('TemporalEngine conflict evaluator error handling', () => {
  it('catches evaluator errors and continues', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});

    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), {
      tournamentId: TEST_TOURNAMENT,
      conflictEvaluators: [
        {
          id: 'BROKEN',
          description: 'Always throws',
          evaluate: () => {
            throw new Error('evaluator crash');
          },
        },
      ],
    });

    const result = engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T12:00:00' },
      type: BLOCK_TYPES.PRACTICE,
    });
    // Block should still be applied despite evaluator error
    expect(result.applied).toHaveLength(1);

    vi.restoreAllMocks();
  });
});
