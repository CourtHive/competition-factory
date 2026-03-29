import { sanctioningEngine } from '@Assemblies/engines/sanctioning';
import { beforeEach, describe, expect, it } from 'vitest';

// Types
import type { Applicant, TournamentProposal, CalendarEvent } from '@Types/sanctioningTypes';

const testApplicant: Applicant = {
  organisationId: 'org-001',
  organisationName: 'Test Club',
  contactName: 'Jane Doe',
  contactEmail: 'jane@test.com',
};

function createRecord(startDate: string, endDate: string, overrides?: Partial<TournamentProposal>) {
  sanctioningEngine.createSanctioningRecord({
    governingBodyId: 'gov-001',
    applicant: testApplicant,
    sanctioningLevel: 'Level 2',
    proposal: {
      tournamentName: 'Test Open',
      proposedStartDate: startDate,
      proposedEndDate: endDate,
      calendarSection: 'Southeast',
      events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
      ...overrides,
    },
  });
}

describe('Calendar Conflict Detection', () => {
  beforeEach(() => {
    sanctioningEngine.reset();
  });

  it('detects overlapping dates (same week)', () => {
    createRecord('2027-06-01', '2027-06-07');

    const existingEvents: CalendarEvent[] = [
      {
        sanctioningId: 'existing-1',
        tournamentName: 'Existing Open',
        startDate: '2027-06-03',
        endDate: '2027-06-09',
        sanctioningTier: 'Level 2',
        calendarSection: 'Southeast',
      },
    ];

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents,
        calendarRules: { proximityWeeks: 2 },
      },
    });
    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(true);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors[0].type).toEqual('SAME_WEEK');
  });

  it('detects proximity conflict (within 2 weeks)', () => {
    createRecord('2027-06-15', '2027-06-21');

    const existingEvents: CalendarEvent[] = [
      {
        tournamentName: 'Nearby Open',
        startDate: '2027-06-01',
        endDate: '2027-06-07',
        sanctioningTier: 'Level 2',
        calendarSection: 'Southeast',
      },
    ];

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents,
        calendarRules: { proximityWeeks: 2 },
      },
    });
    expect(result.hasConflicts).toBe(true);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings[0].type).toEqual('PROXIMITY');
  });

  it('no conflict when events are far apart', () => {
    createRecord('2027-09-01', '2027-09-07');

    const existingEvents: CalendarEvent[] = [
      {
        startDate: '2027-06-01',
        endDate: '2027-06-07',
        sanctioningTier: 'Level 2',
        calendarSection: 'Southeast',
      },
    ];

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents,
        calendarRules: { proximityWeeks: 2 },
      },
    });
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toHaveLength(0);
  });

  it('no conflict when different section', () => {
    createRecord('2027-06-01', '2027-06-07', { calendarSection: 'Northwest' });

    const existingEvents: CalendarEvent[] = [
      {
        startDate: '2027-06-01',
        endDate: '2027-06-07',
        sanctioningTier: 'Level 2',
        calendarSection: 'Southeast',
      },
    ];

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents,
        calendarRules: { proximityWeeks: 2 },
      },
    });
    expect(result.hasConflicts).toBe(false);
  });

  it('detects blackout date conflict', () => {
    createRecord('2027-07-01', '2027-07-07');

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents: [],
        calendarRules: {
          blackoutDates: ['2027-07-04'],
        },
      },
    });
    expect(result.hasConflicts).toBe(true);
    const blackout = result.errors.find((c: any) => c.type === 'BLACKOUT');
    expect(blackout).toBeDefined();
    expect(blackout.message).toContain('2027-07-04');
  });

  it('no blackout conflict when dates do not overlap', () => {
    createRecord('2027-07-10', '2027-07-15');

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents: [],
        calendarRules: {
          blackoutDates: ['2027-07-04'],
        },
      },
    });
    expect(result.hasConflicts).toBe(false);
  });

  it('detects max events per week', () => {
    createRecord('2027-06-01', '2027-06-07');

    const existingEvents: CalendarEvent[] = [
      { startDate: '2027-06-01', endDate: '2027-06-03' },
      { startDate: '2027-06-02', endDate: '2027-06-04' },
      { startDate: '2027-06-03', endDate: '2027-06-05' },
    ];

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents,
        calendarRules: { maxEventsPerWeek: 3 },
      },
    });
    expect(result.hasConflicts).toBe(true);
    const maxWeek = result.conflicts.find((c: any) => c.type === 'MAX_EVENTS_PER_WEEK');
    expect(maxWeek).toBeDefined();
  });

  it('detects geographic proximity conflict', () => {
    createRecord('2027-06-01', '2027-06-07', {
      venues: [
        {
          venueName: 'Local Courts',
          numberOfCourts: 8,
          coordinates: { latitude: 33.749, longitude: -84.388 }, // Atlanta
        },
      ],
    });

    const existingEvents: CalendarEvent[] = [
      {
        startDate: '2027-06-01',
        endDate: '2027-06-07',
        coordinates: { latitude: 33.753, longitude: -84.386 }, // very close to Atlanta
      },
    ];

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents,
        calendarRules: { proximityRadiusKm: 50 },
      },
    });
    expect(result.hasConflicts).toBe(true);
    const proxConflict = result.conflicts.find((c: any) => c.type === 'PROXIMITY');
    expect(proxConflict).toBeDefined();
  });

  it('no geographic conflict when far apart', () => {
    createRecord('2027-06-01', '2027-06-07', {
      venues: [
        {
          venueName: 'West Coast Courts',
          numberOfCourts: 8,
          coordinates: { latitude: 34.052, longitude: -118.243 }, // Los Angeles
        },
      ],
    });

    const existingEvents: CalendarEvent[] = [
      {
        startDate: '2027-06-01',
        endDate: '2027-06-07',
        coordinates: { latitude: 40.712, longitude: -74.006 }, // New York
      },
    ];

    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents,
        calendarRules: { proximityRadiusKm: 50 },
      },
    });
    const geoConflicts = result.conflicts.filter((c: any) => c.type === 'PROXIMITY');
    expect(geoConflicts).toHaveLength(0);
  });

  it('returns error without calendarContext', () => {
    createRecord('2027-06-01', '2027-06-07');
    let result: any = sanctioningEngine.getCalendarConflicts({});
    expect(result.error).toBeDefined();
  });

  it('auto-loads calendarRules from policy snapshot when not provided in context', () => {
    // Create, submit (snapshots policy), then approve + get back to queryable state
    sanctioningEngine.createSanctioningRecord({
      governingBodyId: 'gov-001',
      applicant: testApplicant,
      sanctioningLevel: 'Level 2',
      proposal: {
        tournamentName: 'Policy Rules Test',
        proposedStartDate: '2027-06-01',
        proposedEndDate: '2027-06-07',
        calendarSection: 'Southeast',
        events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
      },
    });

    // Submit with a policy that has calendarRules
    sanctioningEngine.submitApplication({
      sanctioningPolicy: {
        policyName: 'Test',
        policyVersion: '1.0',
        effectiveDate: '2026-01-01',
        governingBodyId: 'gov-001',
        tiers: [],
        calendarRules: { proximityWeeks: 2 },
      },
    });

    // Provide calendarContext WITHOUT calendarRules — should fall back to snapshot
    let result: any = sanctioningEngine.getCalendarConflicts({
      calendarContext: {
        existingEvents: [
          {
            startDate: '2027-06-01',
            endDate: '2027-06-07',
            sanctioningTier: 'Level 2',
            calendarSection: 'Southeast',
          },
        ],
      } as any,
    });

    expect(result.hasConflicts).toBe(true);
    expect(result.errors.some((c: any) => c.type === 'SAME_WEEK')).toBe(true);
  });
});
