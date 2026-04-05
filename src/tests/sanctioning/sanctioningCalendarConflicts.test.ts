import { getCalendarConflicts } from '@Query/sanctioning/getCalendarConflicts';
import { MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { describe, expect, it } from 'vitest';

import type { CalendarContext, CalendarEvent, SanctioningRecord, TournamentProposal } from '@Types/sanctioningTypes';

function minimalProposal(overrides?: Partial<TournamentProposal>): TournamentProposal {
  return {
    tournamentName: 'Proposed Open',
    proposedStartDate: '2027-06-15',
    proposedEndDate: '2027-06-21',
    events: [{ eventName: 'Singles', eventType: 'SINGLES' }],
    ...overrides,
  };
}

function minimalRecord(overrides?: Partial<SanctioningRecord>): SanctioningRecord {
  return {
    sanctioningId: 'sanc-001',
    status: 'DRAFT',
    version: 1,
    createdAt: '2027-01-01',
    updatedAt: '2027-01-01',
    applicant: { organisationId: 'org-001' },
    governingBodyId: 'gov-001',
    proposal: minimalProposal(),
    ...overrides,
  } as SanctioningRecord;
}

describe('getCalendarConflicts — error paths', () => {
  it('returns MISSING_SANCTIONING_RECORD when sanctioningRecord is undefined', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: undefined as any,
      calendarContext: { existingEvents: [], calendarRules: {} },
    });
    expect(result.error).toEqual(MISSING_SANCTIONING_RECORD);
  });

  it('returns INVALID_VALUES when calendarContext is undefined', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord(),
      calendarContext: undefined as any,
    });
    expect(result.error).toEqual(INVALID_VALUES);
    expect(result.context.message).toEqual('Missing calendarContext');
  });

  it('returns success with empty conflicts when no rules and no events', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord(),
      calendarContext: { existingEvents: [], calendarRules: {} },
    });
    expect(result.success).toBe(true);
    expect(result.hasConflicts).toBe(false);
    expect(result.conflicts).toHaveLength(0);
    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });
});

describe('getCalendarConflicts — blackout dates', () => {
  it('skips blackout check when blackoutDates is empty', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord(),
      calendarContext: { existingEvents: [], calendarRules: { blackoutDates: [] } },
    });
    expect(result.hasConflicts).toBe(false);
  });

  it('detects blackout date within proposed range', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord(),
      calendarContext: { existingEvents: [], calendarRules: { blackoutDates: ['2027-06-18'] } },
    });
    expect(result.hasConflicts).toBe(true);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].type).toEqual('BLACKOUT');
    expect(result.errors[0].severity).toEqual('error');
    expect(result.errors[0].message).toContain('2027-06-18');
  });

  it('ignores blackout date outside proposed range', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord(),
      calendarContext: { existingEvents: [], calendarRules: { blackoutDates: ['2027-07-04'] } },
    });
    expect(result.hasConflicts).toBe(false);
  });
});

describe('getCalendarConflicts — temporal proximity', () => {
  const existingEvent: CalendarEvent = {
    sanctioningId: 'exist-001',
    tournamentName: 'Existing Open',
    startDate: '2027-06-01',
    endDate: '2027-06-07',
    sanctioningTier: 'W50',
    calendarSection: 'Southeast',
  };

  it('skips temporal check when proximityWeeks is not set', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        sanctioningLevel: 'W50',
        proposal: minimalProposal({ calendarSection: 'Southeast' }),
      }),
      calendarContext: { existingEvents: [existingEvent], calendarRules: {} },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'SAME_WEEK' || c.type === 'PROXIMITY')).toHaveLength(0);
  });

  it('reports SAME_WEEK error for overlapping events in same section and tier', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        sanctioningLevel: 'W50',
        proposal: minimalProposal({
          proposedStartDate: '2027-06-03',
          proposedEndDate: '2027-06-09',
          calendarSection: 'Southeast',
        }),
      }),
      calendarContext: { existingEvents: [existingEvent], calendarRules: { proximityWeeks: 2 } },
    });
    expect(result.errors.some((c: any) => c.type === 'SAME_WEEK')).toBe(true);
    expect(result.errors[0].conflictingEvent).toBeDefined();
  });

  it('reports PROXIMITY warning when proposed is after existing within proximity window', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        sanctioningLevel: 'W50',
        proposal: minimalProposal({
          proposedStartDate: '2027-06-10',
          proposedEndDate: '2027-06-16',
          calendarSection: 'Southeast',
        }),
      }),
      calendarContext: { existingEvents: [existingEvent], calendarRules: { proximityWeeks: 2 } },
    });
    expect(result.warnings.some((c: any) => c.type === 'PROXIMITY')).toBe(true);
    expect(result.warnings[0].message).toContain('2 week(s)');
  });

  it('reports PROXIMITY warning when proposed is before existing within proximity window', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        sanctioningLevel: 'W50',
        proposal: minimalProposal({
          proposedStartDate: '2027-05-26',
          proposedEndDate: '2027-05-30',
          calendarSection: 'Southeast',
        }),
      }),
      calendarContext: { existingEvents: [existingEvent], calendarRules: { proximityWeeks: 2 } },
    });
    expect(result.warnings.some((c: any) => c.type === 'PROXIMITY')).toBe(true);
  });

  it('no temporal conflict when gap exceeds proximity window', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        sanctioningLevel: 'W50',
        proposal: minimalProposal({ calendarSection: 'Southeast' }),
      }),
      calendarContext: { existingEvents: [existingEvent], calendarRules: { proximityWeeks: 1 } },
    });
    // proposed 2027-06-15 to 2027-06-21 vs existing 2027-06-01 to 2027-06-07: 8-day gap > 7 days
    expect(result.conflicts.filter((c: any) => c.type === 'SAME_WEEK' || c.type === 'PROXIMITY')).toHaveLength(0);
  });

  it('skips temporal conflict when different calendarSection', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        sanctioningLevel: 'W50',
        proposal: minimalProposal({
          proposedStartDate: '2027-06-03',
          proposedEndDate: '2027-06-09',
          calendarSection: 'Northwest',
        }),
      }),
      calendarContext: { existingEvents: [existingEvent], calendarRules: { proximityWeeks: 2 } },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'SAME_WEEK')).toHaveLength(0);
  });

  it('skips temporal conflict when different sanctioning tier', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        sanctioningLevel: 'W100',
        proposal: minimalProposal({
          proposedStartDate: '2027-06-03',
          proposedEndDate: '2027-06-09',
          calendarSection: 'Southeast',
        }),
      }),
      calendarContext: { existingEvents: [existingEvent], calendarRules: { proximityWeeks: 2 } },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'SAME_WEEK')).toHaveLength(0);
  });
});

describe('getCalendarConflicts — geographic proximity', () => {
  const atlanta = { latitude: 33.749, longitude: -84.388 };
  const nearAtlanta = { latitude: 33.753, longitude: -84.386 };
  const losAngeles = { latitude: 34.052, longitude: -118.243 };

  it('skips geo check when proximityRadiusKm is not set', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        proposal: minimalProposal({
          proposedStartDate: '2027-06-01',
          proposedEndDate: '2027-06-07',
          venues: [{ venueName: 'V1', coordinates: atlanta }],
        }),
      }),
      calendarContext: {
        existingEvents: [{ startDate: '2027-06-01', endDate: '2027-06-07', coordinates: nearAtlanta }],
        calendarRules: {},
      },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'PROXIMITY')).toHaveLength(0);
  });

  it('skips geo check when proposal has no venues', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        proposal: minimalProposal({ proposedStartDate: '2027-06-01', proposedEndDate: '2027-06-07' }),
      }),
      calendarContext: {
        existingEvents: [{ startDate: '2027-06-01', endDate: '2027-06-07', coordinates: nearAtlanta }],
        calendarRules: { proximityRadiusKm: 50 },
      },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'PROXIMITY')).toHaveLength(0);
  });

  it('skips geo check when existing event has no coordinates', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        proposal: minimalProposal({
          proposedStartDate: '2027-06-01',
          proposedEndDate: '2027-06-07',
          venues: [{ venueName: 'V1', coordinates: atlanta }],
        }),
      }),
      calendarContext: {
        existingEvents: [{ startDate: '2027-06-01', endDate: '2027-06-07' }],
        calendarRules: { proximityRadiusKm: 50 },
      },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'PROXIMITY')).toHaveLength(0);
  });

  it('skips geo check when no venue has coordinates', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        proposal: minimalProposal({
          proposedStartDate: '2027-06-01',
          proposedEndDate: '2027-06-07',
          venues: [{ venueName: 'V1' }],
        }),
      }),
      calendarContext: {
        existingEvents: [{ startDate: '2027-06-01', endDate: '2027-06-07', coordinates: nearAtlanta }],
        calendarRules: { proximityRadiusKm: 50 },
      },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'PROXIMITY')).toHaveLength(0);
  });

  it('detects geo proximity error for overlapping close events', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        proposal: minimalProposal({
          proposedStartDate: '2027-06-01',
          proposedEndDate: '2027-06-07',
          venues: [{ venueName: 'V1', coordinates: atlanta }],
        }),
      }),
      calendarContext: {
        existingEvents: [{ startDate: '2027-06-03', endDate: '2027-06-09', coordinates: nearAtlanta }],
        calendarRules: { proximityRadiusKm: 50 },
      },
    });
    const geoConflicts = result.conflicts.filter((c: any) => c.type === 'PROXIMITY');
    expect(geoConflicts).toHaveLength(1);
    expect(geoConflicts[0].severity).toEqual('error');
    expect(geoConflicts[0].message).toContain('km');
  });

  it('no geo conflict when distance exceeds radius', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        proposal: minimalProposal({
          proposedStartDate: '2027-06-01',
          proposedEndDate: '2027-06-07',
          venues: [{ venueName: 'V1', coordinates: atlanta }],
        }),
      }),
      calendarContext: {
        existingEvents: [{ startDate: '2027-06-01', endDate: '2027-06-07', coordinates: losAngeles }],
        calendarRules: { proximityRadiusKm: 50 },
      },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'PROXIMITY')).toHaveLength(0);
  });

  it('no geo conflict when close but not temporally overlapping', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        proposal: minimalProposal({
          proposedStartDate: '2027-06-15',
          proposedEndDate: '2027-06-21',
          venues: [{ venueName: 'V1', coordinates: atlanta }],
        }),
      }),
      calendarContext: {
        existingEvents: [{ startDate: '2027-06-01', endDate: '2027-06-07', coordinates: nearAtlanta }],
        calendarRules: { proximityRadiusKm: 50 },
      },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'PROXIMITY')).toHaveLength(0);
  });
});

describe('getCalendarConflicts — max events per week', () => {
  it('skips check when maxEventsPerWeek is not set', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord(),
      calendarContext: {
        existingEvents: [
          { startDate: '2027-06-15', endDate: '2027-06-17' },
          { startDate: '2027-06-16', endDate: '2027-06-18' },
        ],
        calendarRules: {},
      },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'MAX_EVENTS_PER_WEEK')).toHaveLength(0);
  });

  it('detects max events per week exceeded', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord(),
      calendarContext: {
        existingEvents: [
          { startDate: '2027-06-15', endDate: '2027-06-17' },
          { startDate: '2027-06-16', endDate: '2027-06-18' },
        ],
        calendarRules: { maxEventsPerWeek: 2 },
      },
    });
    const maxConflicts = result.conflicts.filter((c: any) => c.type === 'MAX_EVENTS_PER_WEEK');
    expect(maxConflicts).toHaveLength(1);
    expect(maxConflicts[0].severity).toEqual('warning');
    expect(maxConflicts[0].message).toContain('2 events');
    expect(maxConflicts[0].message).toContain('max 2');
  });

  it('no conflict when under max events per week', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord(),
      calendarContext: {
        existingEvents: [{ startDate: '2027-06-15', endDate: '2027-06-17' }],
        calendarRules: { maxEventsPerWeek: 3 },
      },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'MAX_EVENTS_PER_WEEK')).toHaveLength(0);
  });

  it('counts only events in the same week', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord(),
      calendarContext: {
        existingEvents: [
          { startDate: '2027-06-01', endDate: '2027-06-03' }, // different week
          { startDate: '2027-06-15', endDate: '2027-06-17' }, // same week
        ],
        calendarRules: { maxEventsPerWeek: 2 },
      },
    });
    expect(result.conflicts.filter((c: any) => c.type === 'MAX_EVENTS_PER_WEEK')).toHaveLength(0);
  });
});

describe('getCalendarConflicts — eventLabel fallback and policySnapshot', () => {
  it('uses sanctioningId as label when tournamentName is absent', () => {
    const existingEvent: CalendarEvent = {
      sanctioningId: 'sanc-existing',
      startDate: '2027-06-15',
      endDate: '2027-06-21',
      sanctioningTier: 'W50',
      calendarSection: 'Southeast',
    };

    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        sanctioningLevel: 'W50',
        proposal: minimalProposal({
          proposedStartDate: '2027-06-17',
          proposedEndDate: '2027-06-23',
          calendarSection: 'Southeast',
        }),
      }),
      calendarContext: { existingEvents: [existingEvent], calendarRules: { proximityWeeks: 2 } },
    });
    expect(result.errors[0].message).toContain('sanc-existing');
  });

  it('uses "existing event" as label when both tournamentName and sanctioningId are absent', () => {
    const existingEvent: CalendarEvent = {
      startDate: '2027-06-15',
      endDate: '2027-06-21',
    };

    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        proposal: minimalProposal({
          proposedStartDate: '2027-06-17',
          proposedEndDate: '2027-06-23',
        }),
      }),
      calendarContext: { existingEvents: [existingEvent], calendarRules: { proximityWeeks: 4 } },
    });
    expect(result.hasConflicts).toBe(true);
    expect(result.errors[0].message).toContain('existing event');
  });

  it('falls back to policySnapshot.calendarRules when calendarContext omits calendarRules', () => {
    let result: any = getCalendarConflicts({
      sanctioningRecord: minimalRecord({
        sanctioningLevel: 'W50',
        policySnapshot: {
          policyName: 'Test',
          policyVersion: '1.0',
          effectiveDate: '2026-01-01',
          governingBodyId: 'gov-001',
          tiers: [],
          calendarRules: { proximityWeeks: 2 },
        },
        proposal: minimalProposal({
          proposedStartDate: '2027-06-03',
          proposedEndDate: '2027-06-09',
          calendarSection: 'Southeast',
        }),
      }),
      calendarContext: {
        existingEvents: [
          {
            tournamentName: 'Existing',
            startDate: '2027-06-01',
            endDate: '2027-06-07',
            sanctioningTier: 'W50',
            calendarSection: 'Southeast',
          },
        ],
      } as any as CalendarContext,
    });
    expect(result.hasConflicts).toBe(true);
    expect(result.errors.some((c: any) => c.type === 'SAME_WEEK')).toBe(true);
  });
});
