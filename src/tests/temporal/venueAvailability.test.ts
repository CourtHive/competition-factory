/**
 * Venue Availability Tests
 *
 * Tests for venue-level availability support in the temporal engine:
 * - venueKey / venueDayKey helpers
 * - Venue-level loading from tournament record
 * - Court + venue intersection logic
 * - Venue API methods
 * - Snapshot preservation
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { TemporalEngine } from '@Assemblies/engines/temporal/TemporalEngine';
import { venueKey, venueDayKey } from '@Assemblies/governors/temporalGovernor/railDerivation';
import { BLOCK_TYPES } from '@Assemblies/governors/temporalGovernor/types';

// ============================================================================
// Test Fixtures
// ============================================================================

const TOURNAMENT_ID = 'test-tournament';
const VENUE_ID = 'venue-1';
const COURT_1 = 'court-1';
const COURT_2 = 'court-2';

function makeCourtRef(courtId = COURT_1) {
  return { tournamentId: TOURNAMENT_ID, venueId: VENUE_ID, courtId };
}

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
// 1. venueKey / venueDayKey helpers
// ============================================================================

describe('venueKey / venueDayKey helpers', () => {
  it('venueKey produces correct key', () => {
    expect(venueKey('t1', 'v1')).toBe('t1|v1');
  });

  it('venueDayKey produces correct key', () => {
    expect(venueDayKey('t1', 'v1', '2026-06-15')).toBe('t1|v1|2026-06-15');
  });

  it('different inputs produce different keys', () => {
    expect(venueKey('t1', 'v1')).not.toBe(venueKey('t1', 'v2'));
    expect(venueDayKey('t1', 'v1', '2026-06-15')).not.toBe(venueDayKey('t1', 'v1', '2026-06-16'));
  });
});

// ============================================================================
// 2. Venue-level loading
// ============================================================================

describe('Venue-level loading from tournament record', () => {
  it('loads venue defaultStartTime / defaultEndTime', () => {
    const record = makeBasicRecord();
    record.venues[0].defaultStartTime = '08:00';
    record.venues[0].defaultEndTime = '20:00';

    const engine = new TemporalEngine();
    engine.init(record, { tournamentId: TOURNAMENT_ID });

    const avail = engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID);
    expect(avail).toEqual({ startTime: '08:00', endTime: '20:00' });
  });

  it('loads date-specific venue dateAvailability', () => {
    const record = makeBasicRecord();
    record.venues[0].dateAvailability = [
      { date: '2026-06-15', startTime: '09:00', endTime: '18:00', venueId: VENUE_ID },
    ];

    const engine = new TemporalEngine();
    engine.init(record, { tournamentId: TOURNAMENT_ID });

    const dayAvail = engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-15');
    expect(dayAvail).toEqual({ startTime: '09:00', endTime: '18:00' });
  });

  it('dateless venue dateAvailability overrides defaultStartTime/defaultEndTime', () => {
    const record = makeBasicRecord();
    record.venues[0].defaultStartTime = '08:00';
    record.venues[0].defaultEndTime = '20:00';
    record.venues[0].dateAvailability = [
      { startTime: '07:00', endTime: '22:00', venueId: VENUE_ID },
    ];

    const engine = new TemporalEngine();
    engine.init(record, { tournamentId: TOURNAMENT_ID });

    // The dateless entry should override the defaultStartTime/defaultEndTime
    const avail = engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID);
    expect(avail).toEqual({ startTime: '07:00', endTime: '22:00' });
  });

  it('venue-level bookings create blocks for ALL courts in the venue', () => {
    const record = makeBasicRecord();
    record.venues[0].dateAvailability = [
      {
        date: '2026-06-15',
        startTime: '08:00',
        endTime: '20:00',
        venueId: VENUE_ID,
        bookings: [
          { startTime: '12:00', endTime: '13:00', bookingType: 'MAINTENANCE' },
        ],
      },
    ];

    const engine = new TemporalEngine();
    engine.init(record, { tournamentId: TOURNAMENT_ID });

    const allBlocks = engine.getAllBlocks();
    // Should create one block per court (2 courts)
    expect(allBlocks).toHaveLength(2);
    expect(allBlocks.every((b) => b.type === BLOCK_TYPES.MAINTENANCE)).toBe(true);

    const courtIds = allBlocks.map((b) => b.court.courtId).sort();
    expect(courtIds).toEqual([COURT_1, COURT_2]);
  });
});

// ============================================================================
// 3. Intersection logic
// ============================================================================

describe('Court + Venue intersection logic', () => {
  let engine: TemporalEngine;

  beforeEach(() => {
    engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });
  });

  it('court + venue → later start / earlier end', () => {
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '07:00', endTime: '21:00' });
    engine.setVenueDayAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-15', { startTime: '08:00', endTime: '20:00' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    expect(avail).toEqual({ startTime: '08:00', endTime: '20:00' });
  });

  it('intersection takes max start and min end', () => {
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '09:00', endTime: '18:00' });
    engine.setVenueDayAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-15', { startTime: '07:00', endTime: '22:00' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    expect(avail).toEqual({ startTime: '09:00', endTime: '18:00' });
  });

  it('court-only fallback when no venue availability', () => {
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '10:00', endTime: '19:00' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    expect(avail).toEqual({ startTime: '10:00', endTime: '19:00' });
  });

  it('venue-only fallback when no court availability', () => {
    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '08:00', endTime: '20:00' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    expect(avail).toEqual({ startTime: '08:00', endTime: '20:00' });
  });

  it('global default fallback when neither court nor venue set', () => {
    engine.setAllCourtsDefaultAvailability({ startTime: '07:00', endTime: '21:00' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    expect(avail).toEqual({ startTime: '07:00', endTime: '21:00' });
  });

  it('config fallback when nothing is set', () => {
    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    // Default from engine config: dayStartTime='06:00', dayEndTime='23:00'
    expect(avail).toEqual({ startTime: '06:00', endTime: '23:00' });
  });

  it('empty intersection guard → fall back to venue availability', () => {
    // Court says 08:00-10:00, venue says 12:00-20:00 → no overlap → use venue
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '08:00', endTime: '10:00' });
    engine.setVenueDayAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-15', { startTime: '12:00', endTime: '20:00' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    expect(avail).toEqual({ startTime: '12:00', endTime: '20:00' });
  });

  it('venue DEFAULT used when no day-specific venue entry', () => {
    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '08:00', endTime: '20:00' });
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '06:00', endTime: '22:00' });

    const avail = engine.getCourtAvailability(makeCourtRef(), '2026-06-15');
    // Intersection: max('06:00','08:00')='08:00', min('22:00','20:00')='20:00'
    expect(avail).toEqual({ startTime: '08:00', endTime: '20:00' });
  });
});

// ============================================================================
// 4. API methods
// ============================================================================

describe('Venue API methods', () => {
  let engine: TemporalEngine;
  let events: any[];

  beforeEach(() => {
    engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });
    events = [];
    engine.subscribe((e) => events.push(e));
  });

  it('setVenueDefaultAvailability stores and emits AVAILABILITY_CHANGED', () => {
    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '08:00', endTime: '20:00' });

    const avail = engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID);
    expect(avail).toEqual({ startTime: '08:00', endTime: '20:00' });

    const availEvent = events.find((e) => e.type === 'AVAILABILITY_CHANGED');
    expect(availEvent).toBeTruthy();
    expect(availEvent.payload.scope).toBe('venue');
  });

  it('setVenueDayAvailability stores correctly and emits event', () => {
    engine.setVenueDayAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-15', { startTime: '09:00', endTime: '18:00' });

    const avail = engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-15');
    expect(avail).toEqual({ startTime: '09:00', endTime: '18:00' });

    const availEvent = events.find((e) => e.type === 'AVAILABILITY_CHANGED');
    expect(availEvent).toBeTruthy();
    expect(availEvent.payload.scope).toBe('venue-day');
  });

  it('getVenueAvailability resolves day → default → null', () => {
    // Nothing set
    expect(engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID)).toBeNull();
    expect(engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-15')).toBeNull();

    // Set default
    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '08:00', endTime: '20:00' });
    expect(engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID)).toEqual({ startTime: '08:00', endTime: '20:00' });
    expect(engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-15')).toEqual({ startTime: '08:00', endTime: '20:00' });

    // Set day-specific -- day resolves to it, no-day still returns default
    engine.setVenueDayAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-15', { startTime: '10:00', endTime: '16:00' });
    expect(engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-15')).toEqual({ startTime: '10:00', endTime: '16:00' });
    expect(engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID)).toEqual({ startTime: '08:00', endTime: '20:00' });
    expect(engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID, '2026-06-16')).toEqual({ startTime: '08:00', endTime: '20:00' });
  });

  it('getConfig exposes engine config', () => {
    const config = engine.getConfig();
    expect(config.tournamentId).toBe(TOURNAMENT_ID);
    expect(config.dayStartTime).toBe('06:00');
    expect(config.dayEndTime).toBe('23:00');
  });
});

// ============================================================================
// 5. clearCourtAvailabilityForVenue / getCourtAvailabilityKeys
// ============================================================================

describe('clearCourtAvailabilityForVenue', () => {
  it('removes all court-level entries for the venue', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    const court1 = makeCourtRef(COURT_1);
    const court2 = makeCourtRef(COURT_2);

    // Set per-court availability
    engine.setCourtAvailabilityAllDays(court1, { startTime: '09:00', endTime: '17:00' });
    engine.setCourtAvailability(court1, '2026-06-15', { startTime: '10:00', endTime: '16:00' });
    engine.setCourtAvailabilityAllDays(court2, { startTime: '08:00', endTime: '18:00' });

    // Verify they exist
    expect(engine.getCourtAvailabilityKeys(court1)).toHaveLength(2); // DEFAULT + day
    expect(engine.getCourtAvailabilityKeys(court2)).toHaveLength(1); // DEFAULT

    // Clear all court entries for the venue
    engine.clearCourtAvailabilityForVenue(TOURNAMENT_ID, VENUE_ID);

    // All court-level entries should be gone
    expect(engine.getCourtAvailabilityKeys(court1)).toHaveLength(0);
    expect(engine.getCourtAvailabilityKeys(court2)).toHaveLength(0);
  });

  it('does not affect venue-level availability', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '08:00', endTime: '20:00' });
    engine.setCourtAvailabilityAllDays(makeCourtRef(), { startTime: '09:00', endTime: '17:00' });

    engine.clearCourtAvailabilityForVenue(TOURNAMENT_ID, VENUE_ID);

    // Venue availability should still be there
    expect(engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID)).toEqual({ startTime: '08:00', endTime: '20:00' });
    // Court should now inherit from venue
    expect(engine.getCourtAvailability(makeCourtRef(), '2026-06-15')).toEqual({ startTime: '08:00', endTime: '20:00' });
  });

  it('does not affect courts in other venues', () => {
    const record = makeBasicRecord();
    record.venues.push({
      venueId: 'venue-2',
      courts: [{ courtId: 'court-3', courtName: 'Court 3' }],
    });

    const engine = new TemporalEngine();
    engine.init(record, { tournamentId: TOURNAMENT_ID });

    const courtInVenue2 = { tournamentId: TOURNAMENT_ID, venueId: 'venue-2', courtId: 'court-3' };
    engine.setCourtAvailabilityAllDays(makeCourtRef(), { startTime: '09:00', endTime: '17:00' });
    engine.setCourtAvailabilityAllDays(courtInVenue2, { startTime: '10:00', endTime: '16:00' });

    engine.clearCourtAvailabilityForVenue(TOURNAMENT_ID, VENUE_ID);

    // Venue 1 court cleared
    expect(engine.getCourtAvailabilityKeys(makeCourtRef())).toHaveLength(0);
    // Venue 2 court untouched
    expect(engine.getCourtAvailabilityKeys(courtInVenue2)).toEqual(['DEFAULT']);
  });

  it('emits AVAILABILITY_CHANGED event', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    const events: any[] = [];
    engine.subscribe((e) => events.push(e));

    engine.clearCourtAvailabilityForVenue(TOURNAMENT_ID, VENUE_ID);

    const evt = events.find((e) => e.type === 'AVAILABILITY_CHANGED' && e.payload.scope === 'clear-venue-courts');
    expect(evt).toBeTruthy();
    expect(evt.payload.venueId).toBe(VENUE_ID);
  });
});

describe('getCourtAvailabilityKeys', () => {
  it('returns empty array when no court-level entries exist', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    expect(engine.getCourtAvailabilityKeys(makeCourtRef())).toEqual([]);
  });

  it('returns DEFAULT when court has all-days availability', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    engine.setCourtAvailabilityAllDays(makeCourtRef(), { startTime: '09:00', endTime: '17:00' });
    expect(engine.getCourtAvailabilityKeys(makeCourtRef())).toEqual(['DEFAULT']);
  });

  it('returns day strings for day-specific entries', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '09:00', endTime: '17:00' });
    engine.setCourtAvailability(makeCourtRef(), '2026-06-16', { startTime: '10:00', endTime: '18:00' });

    const keys = engine.getCourtAvailabilityKeys(makeCourtRef());
    expect(keys).toHaveLength(2);
    expect(keys).toContain('2026-06-15');
    expect(keys).toContain('2026-06-16');
  });

  it('returns mixed DEFAULT and day keys', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    engine.setCourtAvailabilityAllDays(makeCourtRef(), { startTime: '09:00', endTime: '17:00' });
    engine.setCourtAvailability(makeCourtRef(), '2026-06-15', { startTime: '10:00', endTime: '16:00' });

    const keys = engine.getCourtAvailabilityKeys(makeCourtRef());
    expect(keys).toHaveLength(2);
    expect(keys).toContain('DEFAULT');
    expect(keys).toContain('2026-06-15');
  });
});

// ============================================================================
// 6. Snapshot preservation
// ============================================================================

describe('Snapshot preservation', () => {
  it('venue data survives createSnapshot via simulateBlocks', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    // Set venue-level availability
    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '09:00', endTime: '17:00' });

    // simulateBlocks internally calls createSnapshot()
    const result = engine.simulateBlocks([], '2026-06-15');
    // The simulation should succeed without error
    expect(result).toBeTruthy();
    expect(result.previewRails).toBeDefined();

    // Original engine state should be preserved
    const avail = engine.getVenueAvailability(TOURNAMENT_ID, VENUE_ID);
    expect(avail).toEqual({ startTime: '09:00', endTime: '17:00' });
  });

  it('venue availability affects simulated rails', () => {
    const engine = new TemporalEngine();
    engine.init(makeBasicRecord(), { tournamentId: TOURNAMENT_ID });

    // Set venue availability to narrow window
    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '09:00', endTime: '17:00' });

    // Get court rail -- should use venue-constrained window
    const rail = engine.getCourtRail('2026-06-15', makeCourtRef());
    expect(rail).toBeTruthy();
    // First segment should start at 09:00 (from venue)
    expect(rail!.segments[0].start).toBe('2026-06-15T09:00:00');
    // Last segment should end at 17:00 (from venue)
    const lastSeg = rail!.segments[rail!.segments.length - 1];
    expect(lastSeg.end).toBe('2026-06-15T17:00:00');
  });
});

// ============================================================================
// 7. Court Scheduling Summary
// ============================================================================

describe('getCourtSchedulingSummary', () => {
  it('court with no blocks → all time is available', () => {
    const engine = new TemporalEngine();
    // 3-day tournament, venue open 08:00-20:00 → 12 hours × 3 days = 2160 minutes
    const record = makeBasicRecord();
    engine.init(record, { tournamentId: TOURNAMENT_ID });
    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '08:00', endTime: '20:00' });

    const summary = engine.getCourtSchedulingSummary(makeCourtRef());
    expect(summary.scheduledMinutes).toBe(0);
    expect(summary.blockedMinutes).toBe(0);
    expect(summary.availableMinutes).toBe(3 * 12 * 60); // 2160
  });

  it('court with SCHEDULED block → scheduledMinutes reflects it', () => {
    const engine = new TemporalEngine();
    const record = makeBasicRecord();
    engine.init(record, { tournamentId: TOURNAMENT_ID });
    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '08:00', endTime: '20:00' });

    // Add a 90-minute scheduled block on day 1
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T11:30:00' },
      type: BLOCK_TYPES.SCHEDULED as any,
    });

    const summary = engine.getCourtSchedulingSummary(makeCourtRef());
    expect(summary.scheduledMinutes).toBe(90);
    expect(summary.availableMinutes).toBe(3 * 12 * 60 - 90); // 2070
    expect(summary.blockedMinutes).toBe(0);
  });

  it('court with MAINTENANCE block → blockedMinutes reflects it', () => {
    const engine = new TemporalEngine();
    const record = makeBasicRecord();
    engine.init(record, { tournamentId: TOURNAMENT_ID });
    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '08:00', endTime: '20:00' });

    // Add a 60-minute maintenance block on day 2
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-16T12:00:00', end: '2026-06-16T13:00:00' },
      type: BLOCK_TYPES.MAINTENANCE as any,
    });

    const summary = engine.getCourtSchedulingSummary(makeCourtRef());
    expect(summary.scheduledMinutes).toBe(0);
    expect(summary.blockedMinutes).toBe(60);
    expect(summary.availableMinutes).toBe(3 * 12 * 60 - 60); // 2100
  });

  it('court with both SCHEDULED and BLOCKED → all three fields populated', () => {
    const engine = new TemporalEngine();
    const record = makeBasicRecord();
    engine.init(record, { tournamentId: TOURNAMENT_ID });
    engine.setVenueDefaultAvailability(TOURNAMENT_ID, VENUE_ID, { startTime: '08:00', endTime: '20:00' });

    // 90 min scheduled
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-15T10:00:00', end: '2026-06-15T11:30:00' },
      type: BLOCK_TYPES.SCHEDULED as any,
    });

    // 60 min maintenance
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-16T12:00:00', end: '2026-06-16T13:00:00' },
      type: BLOCK_TYPES.MAINTENANCE as any,
    });

    // 30 min practice
    engine.applyBlock({
      courts: [makeCourtRef()],
      timeRange: { start: '2026-06-17T08:00:00', end: '2026-06-17T08:30:00' },
      type: BLOCK_TYPES.PRACTICE as any,
    });

    const summary = engine.getCourtSchedulingSummary(makeCourtRef());
    expect(summary.scheduledMinutes).toBe(90);
    expect(summary.blockedMinutes).toBe(60 + 30); // maintenance + practice
    expect(summary.availableMinutes).toBe(3 * 12 * 60 - 90 - 90); // 1980
  });
});
