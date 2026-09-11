/**
 * Temporal Grid Factory Bridge Tests
 *
 * Test suite for translation between Availability Engine and TODS format.
 */

import { describe, it, expect } from 'vitest';
import {
  BLOCK_TYPES,
  type VenueDayTimeline,
  type RailSegment,
  type BlockType,
} from '@Assemblies/governors/availabilityGovernor/types';
import {
  railsToDateAvailability,
  applyAvailabilityToTournamentRecord,
  buildSchedulingProfileFromUISelections,
  todsAvailabilityToBlocks,
  validateSchedulingProfileFormat,
  validateDateAvailability,
  mergeOverlappingAvailability,
  calculateCourtHours,
  type TodsDateAvailability,
  type SchedulingSelection,
  type TodsVenue,
} from '@Assemblies/governors/availabilityGovernor/bridge';
import { HydratedVenue } from 'tods-competition-factory';

// ============================================================================
// Test Fixtures
// ============================================================================

const TEST_DATE_START_TIME = '2026-06-15T08:00:00';
const TEST_DATE_END_TIME_2 = '2026-06-15T18:00:00';
const TEST_DATE_END_TIME_3 = '2026-06-15T10:00:00';
const TEST_DATE_END_TIME_4 = '2026-06-15T14:00:00';
const TEST_DATE_END_TIME = '2026-06-15T12:00:00';
const TEST_TOURNAMENT = 'test-tournament';
const TEST_VENUE = 'venue-1';
const TEST_DAY = '2026-06-15';

const mockCourt1 = {
  tournamentId: TEST_TOURNAMENT,
  venueId: TEST_VENUE,
  courtId: 'court-1',
};

const mockCourt2 = {
  tournamentId: TEST_TOURNAMENT,
  venueId: TEST_VENUE,
  courtId: 'court-2',
};

function createSegment(start: string, end: string, status: BlockType = BLOCK_TYPES.AVAILABLE): RailSegment {
  return {
    start,
    end,
    status,
    contributingBlocks: [],
  };
}

function createTimeline(day: string, venueId: string, segments: RailSegment[][]): VenueDayTimeline {
  return {
    day,
    venueId,
    rails: [
      {
        court: mockCourt1,
        segments: segments[0],
      },
      {
        court: mockCourt2,
        segments: segments[1],
      },
    ],
  };
}

// ============================================================================
// railsToDateAvailability Tests
// ============================================================================

describe('railsToDateAvailability', () => {
  it('should convert simple availability to TODS format', () => {
    const timeline = createTimeline(TEST_DAY, TEST_VENUE, [
      [
        createSegment(TEST_DATE_START_TIME, TEST_DATE_END_TIME, BLOCK_TYPES.AVAILABLE),
        createSegment(TEST_DATE_END_TIME, TEST_DATE_END_TIME_2, BLOCK_TYPES.BLOCKED),
      ],
      [createSegment(TEST_DATE_START_TIME, TEST_DATE_END_TIME_2, BLOCK_TYPES.AVAILABLE)],
    ]);

    const result = railsToDateAvailability([timeline]);

    expect(result).toHaveLength(2);

    // Court 1: only 08:00-12:00 is available
    expect(result[0]).toEqual({
      date: TEST_DAY,
      startTime: '08:00',
      endTime: '12:00',
      venueId: 'venue-1',
      courtIds: ['court-1'],
    });

    // Court 2: full day available
    expect(result[1]).toEqual({
      date: TEST_DAY,
      startTime: '08:00',
      endTime: '18:00',
      venueId: 'venue-1',
      courtIds: ['court-2'],
    });
  });

  it('should handle multiple schedulable segments', () => {
    const timeline = createTimeline(TEST_DAY, TEST_VENUE, [
      [
        createSegment(TEST_DATE_START_TIME, TEST_DATE_END_TIME_3, BLOCK_TYPES.AVAILABLE),
        createSegment(TEST_DATE_END_TIME_3, TEST_DATE_END_TIME, BLOCK_TYPES.MAINTENANCE),
        createSegment(TEST_DATE_END_TIME, TEST_DATE_END_TIME_4, BLOCK_TYPES.AVAILABLE),
      ],
      [],
    ]);

    const result = railsToDateAvailability([timeline]);

    // Should have 2 entries for the 2 available windows
    expect(result).toHaveLength(2);
    expect(result[0].startTime).toBe('08:00');
    expect(result[0].endTime).toBe('10:00');
    expect(result[1].startTime).toBe('12:00');
    expect(result[1].endTime).toBe('14:00');
  });

  it('should respect custom schedulable status function', () => {
    const timeline = createTimeline(TEST_DAY, TEST_VENUE, [
      [
        createSegment(TEST_DATE_START_TIME, TEST_DATE_END_TIME_3, BLOCK_TYPES.AVAILABLE),
        createSegment(TEST_DATE_END_TIME_3, TEST_DATE_END_TIME, BLOCK_TYPES.SOFT_BLOCK),
        createSegment(TEST_DATE_END_TIME, TEST_DATE_END_TIME_4, BLOCK_TYPES.HARD_BLOCK),
      ],
      [],
    ]);

    // Default: AVAILABLE and SOFT_BLOCK are schedulable
    const result1 = railsToDateAvailability([timeline]);
    expect(result1).toHaveLength(1);
    expect(result1[0].endTime).toBe('12:00'); // Includes SOFT_BLOCK

    // Custom: Only AVAILABLE is schedulable
    const result2 = railsToDateAvailability([timeline], {
      isSchedulableStatus: (status) => status === 'AVAILABLE',
    });
    expect(result2).toHaveLength(1);
    expect(result2[0].endTime).toBe('10:00'); // Excludes SOFT_BLOCK
  });

  it('should handle empty timelines', () => {
    const result = railsToDateAvailability([]);
    expect(result).toEqual([]);
  });

  it('should handle timelines with no schedulable segments', () => {
    const timeline = createTimeline(TEST_DAY, TEST_VENUE, [
      [
        createSegment(TEST_DATE_START_TIME, TEST_DATE_END_TIME, BLOCK_TYPES.BLOCKED),
        createSegment(TEST_DATE_END_TIME, TEST_DATE_END_TIME_2, BLOCK_TYPES.MAINTENANCE),
      ],
      [],
    ]);

    const result = railsToDateAvailability([timeline]);
    expect(result).toHaveLength(0);
  });

  it('should aggregate by venue when configured', () => {
    const timeline = createTimeline(TEST_DAY, TEST_VENUE, [
      [createSegment(TEST_DATE_START_TIME, TEST_DATE_END_TIME, BLOCK_TYPES.AVAILABLE)],
      [createSegment(TEST_DATE_START_TIME, TEST_DATE_END_TIME, BLOCK_TYPES.AVAILABLE)],
    ]);

    const result = railsToDateAvailability([timeline], {
      aggregateByVenue: true,
    });

    // Should combine into single entry with both court IDs
    expect(result).toHaveLength(1);
    expect(result[0].courtIds).toContain('court-1');
    expect(result[0].courtIds).toContain('court-2');
  });
});

// ============================================================================
// applyAvailabilityToTournamentRecord Tests
// ============================================================================

describe('applyAvailabilityToTournamentRecord', () => {
  it('should update tournament record with availability', () => {
    const tournamentRecord = {
      tournamentId: TEST_TOURNAMENT,
      venues: [
        {
          venueId: 'venue-1',
          venueName: 'Main Stadium',
          courts: [
            { courtId: 'court-1', courtName: 'Court 1' },
            { courtId: 'court-2', courtName: 'Court 2' },
          ],
        },
      ],
    };

    const timeline = createTimeline(TEST_DAY, TEST_VENUE, [
      [createSegment(TEST_DATE_START_TIME, TEST_DATE_END_TIME_2, BLOCK_TYPES.AVAILABLE)],
      [],
    ]);

    const result = applyAvailabilityToTournamentRecord({
      tournamentRecord,
      timelines: [timeline],
    });

    // Should not mutate original
    expect(result).not.toBe(tournamentRecord);
    expect((tournamentRecord.venues[0] as HydratedVenue).dateAvailability).toBeUndefined();

    // Should have dateAvailability in result
    expect((result.venues[0] as HydratedVenue).dateAvailability).toBeDefined();
    expect((result.venues[0] as HydratedVenue).dateAvailability).toHaveLength(1);
    expect((result.venues[0] as HydratedVenue).dateAvailability[0]).toMatchObject({
      date: TEST_DAY,
      startTime: '08:00',
      endTime: '18:00',
      venueId: 'venue-1',
    });
  });

  it('should handle multiple venues', () => {
    const tournamentRecord = {
      venues: [
        { venueId: 'venue-1', courts: [{ courtId: 'court-1' }] },
        { venueId: 'venue-2', courts: [{ courtId: 'court-3' }] },
      ],
    };

    const timelines = [
      createTimeline(TEST_DAY, TEST_VENUE, [
        [createSegment(TEST_DATE_START_TIME, TEST_DATE_END_TIME, BLOCK_TYPES.AVAILABLE)],
        [], // Second court (no segments)
      ]),
      createTimeline(TEST_DAY, 'venue-2', [
        [createSegment(TEST_DATE_END_TIME_3, TEST_DATE_END_TIME_4, BLOCK_TYPES.AVAILABLE)],
        [], // Second court (no segments)
      ]),
    ];

    const result = applyAvailabilityToTournamentRecord({
      tournamentRecord,
      timelines,
    });

    expect((result.venues[0] as HydratedVenue).dateAvailability).toHaveLength(1);
    expect(result.venues[1].dateAvailability).toHaveLength(1);
  });
});

// ============================================================================
// buildSchedulingProfileFromUISelections Tests
// ============================================================================

describe('buildSchedulingProfileFromUISelections', () => {
  it('should build valid scheduling profile', () => {
    const selections: SchedulingSelection[] = [
      {
        scheduleDate: TEST_DAY,
        venueIds: ['venue-1', 'venue-2'],
        rounds: [
          { eventId: 'event-1', roundNumber: 1 },
          { eventId: 'event-1', roundNumber: 2 },
        ],
      },
      {
        scheduleDate: '2026-06-16',
        venueIds: ['venue-1'],
        rounds: [{ eventId: 'event-2', roundNumber: 1 }],
      },
    ];

    const profile = buildSchedulingProfileFromUISelections(selections);

    expect(profile).toHaveLength(2);
    expect(profile[0]).toEqual({
      scheduleDate: TEST_DAY,
      venueIds: ['venue-1', 'venue-2'],
      rounds: [
        { eventId: 'event-1', roundNumber: 1 },
        { eventId: 'event-1', roundNumber: 2 },
      ],
    });
  });

  it('should filter out empty selections', () => {
    const selections: SchedulingSelection[] = [
      {
        scheduleDate: TEST_DAY,
        venueIds: ['venue-1'],
        rounds: [{ eventId: 'event-1', roundNumber: 1 }],
      },
      {
        scheduleDate: '',
        venueIds: [],
        rounds: [],
      },
    ];

    const profile = buildSchedulingProfileFromUISelections(selections);
    expect(profile).toHaveLength(1);
  });

  it('should handle empty selections array', () => {
    const profile = buildSchedulingProfileFromUISelections([]);
    expect(profile).toEqual([]);
  });
});

// ============================================================================
// todsAvailabilityToBlocks Tests
// ============================================================================

describe('todsAvailabilityToBlocks', () => {
  it('should convert TODS availability to blocks', () => {
    const venue: TodsVenue = {
      venueId: 'venue-1',
      courts: [{ courtId: 'court-1' }, { courtId: 'court-2' }],
      dateAvailability: [
        {
          date: TEST_DAY,
          startTime: '08:00',
          endTime: '18:00',
          venueId: 'venue-1',
          courtIds: ['court-1'],
        },
      ],
    };

    const blocks = todsAvailabilityToBlocks({
      venue,
      tournamentId: TEST_TOURNAMENT,
    });

    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toEqual({
      court: {
        tournamentId: TEST_TOURNAMENT,
        venueId: 'venue-1',
        courtId: 'court-1',
      },
      start: TEST_DATE_START_TIME,
      end: TEST_DATE_END_TIME_2,
      type: BLOCK_TYPES.AVAILABLE,
    });
  });

  it('should apply to all courts when courtIds not specified', () => {
    const venue: TodsVenue = {
      venueId: 'venue-1',
      courts: [{ courtId: 'court-1' }, { courtId: 'court-2' }],
      dateAvailability: [
        {
          date: TEST_DAY,
          startTime: '08:00',
          endTime: '18:00',
          venueId: 'venue-1',
        },
      ],
    };

    const blocks = todsAvailabilityToBlocks({
      venue,
      tournamentId: TEST_TOURNAMENT,
    });

    expect(blocks).toHaveLength(2);
    expect(blocks[0].court.courtId).toBe('court-1');
    expect(blocks[1].court.courtId).toBe('court-2');
  });

  it('should allow custom block type', () => {
    const venue: TodsVenue = {
      venueId: 'venue-1',
      courts: [{ courtId: 'court-1' }],
      dateAvailability: [
        {
          date: TEST_DAY,
          startTime: '08:00',
          endTime: '18:00',
          venueId: 'venue-1',
          courtIds: ['court-1'],
        },
      ],
    };

    const blocks = todsAvailabilityToBlocks({
      venue,
      tournamentId: TEST_TOURNAMENT,
      blockType: 'SOFT_BLOCK',
    });

    expect(blocks[0].type).toBe(BLOCK_TYPES.SOFT_BLOCK);
  });
});

// ============================================================================
// Validation Tests
// ============================================================================

describe('validateSchedulingProfileFormat', () => {
  it('should validate correct profile', () => {
    const profile = [
      {
        scheduleDate: TEST_DAY,
        venueIds: ['venue-1'],
        rounds: [{ eventId: 'event-1' }],
      },
    ];

    const result = validateSchedulingProfileFormat(profile);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect missing scheduleDate', () => {
    const profile = [
      {
        scheduleDate: '',
        venueIds: ['venue-1'],
        rounds: [],
      },
    ];

    const result = validateSchedulingProfileFormat(profile);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Item 0: missing scheduleDate');
  });

  it('should detect invalid date format', () => {
    const profile = [
      {
        scheduleDate: '06/15/2026',
        venueIds: ['venue-1'],
        rounds: [],
      },
    ];

    const result = validateSchedulingProfileFormat(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid scheduleDate format'))).toBe(true);
  });

  it('should detect missing venueIds', () => {
    const profile = [
      {
        scheduleDate: TEST_DAY,
        venueIds: [],
        rounds: [],
      },
    ];

    const result = validateSchedulingProfileFormat(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('venueIds'))).toBe(true);
  });

  it('should detect missing eventId in rounds', () => {
    const profile = [
      {
        scheduleDate: TEST_DAY,
        venueIds: ['venue-1'],
        rounds: [{ eventId: '' } as any],
      },
    ];

    const result = validateSchedulingProfileFormat(profile);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('missing eventId'))).toBe(true);
  });
});

describe('validateDateAvailability', () => {
  it('should validate correct availability', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: TEST_DAY,
        startTime: '08:00',
        endTime: '18:00',
        venueId: 'venue-1',
      },
    ];

    const result = validateDateAvailability(entries);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should detect invalid date format', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: '06/15/2026',
        startTime: '08:00',
        endTime: '18:00',
        venueId: 'venue-1',
      },
    ];

    const result = validateDateAvailability(entries);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('invalid or missing date'))).toBe(true);
  });

  it('should detect invalid time format', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: TEST_DAY,
        startTime: '8:00',
        endTime: '18:00',
        venueId: 'venue-1',
      },
    ];

    const result = validateDateAvailability(entries);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('startTime'))).toBe(true);
  });

  it('should detect endTime before startTime', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: TEST_DAY,
        startTime: '18:00',
        endTime: '08:00',
        venueId: 'venue-1',
      },
    ];

    const result = validateDateAvailability(entries);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.includes('startTime must be before endTime'))).toBe(true);
  });
});

// ============================================================================
// Utility Tests
// ============================================================================

describe('mergeOverlappingAvailability', () => {
  it('should merge overlapping entries', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: TEST_DAY,
        startTime: '08:00',
        endTime: '12:00',
        venueId: 'venue-1',
      },
      {
        date: TEST_DAY,
        startTime: '11:00',
        endTime: '14:00',
        venueId: 'venue-1',
      },
    ];

    const merged = mergeOverlappingAvailability(entries);
    expect(merged).toHaveLength(1);
    expect(merged[0].startTime).toBe('08:00');
    expect(merged[0].endTime).toBe('14:00');
  });

  it('should merge adjacent entries', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: TEST_DAY,
        startTime: '08:00',
        endTime: '12:00',
        venueId: 'venue-1',
      },
      {
        date: TEST_DAY,
        startTime: '12:00',
        endTime: '16:00',
        venueId: 'venue-1',
      },
    ];

    const merged = mergeOverlappingAvailability(entries);
    expect(merged).toHaveLength(1);
    expect(merged[0].startTime).toBe('08:00');
    expect(merged[0].endTime).toBe('16:00');
  });

  it('should not merge separate entries', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: TEST_DAY,
        startTime: '08:00',
        endTime: '10:00',
        venueId: 'venue-1',
      },
      {
        date: TEST_DAY,
        startTime: '12:00',
        endTime: '14:00',
        venueId: 'venue-1',
      },
    ];

    const merged = mergeOverlappingAvailability(entries);
    expect(merged).toHaveLength(2);
  });

  it('should merge courtIds when merging entries', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: TEST_DAY,
        startTime: '08:00',
        endTime: '12:00',
        venueId: 'venue-1',
        courtIds: ['court-1'],
      },
      {
        date: TEST_DAY,
        startTime: '10:00',
        endTime: '14:00',
        venueId: 'venue-1',
        courtIds: ['court-2'],
      },
    ];

    const merged = mergeOverlappingAvailability(entries);
    expect(merged).toHaveLength(1);
    expect(merged[0].courtIds).toContain('court-1');
    expect(merged[0].courtIds).toContain('court-2');
  });
});

describe('calculateCourtHours', () => {
  it('should calculate court hours correctly', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: TEST_DAY,
        startTime: '08:00',
        endTime: '10:00',
        venueId: 'venue-1',
        courtIds: ['court-1'],
      },
      {
        date: TEST_DAY,
        startTime: '10:00',
        endTime: '12:00',
        venueId: 'venue-1',
        courtIds: ['court-2'],
      },
    ];

    const hours = calculateCourtHours(entries);
    expect(hours).toBe(4); // 2 hours x 2 courts
  });

  it('should handle multiple courts in single entry', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: TEST_DAY,
        startTime: '08:00',
        endTime: '10:00',
        venueId: 'venue-1',
        courtIds: ['court-1', 'court-2', 'court-3'],
      },
    ];

    const hours = calculateCourtHours(entries);
    expect(hours).toBe(6); // 2 hours x 3 courts
  });

  it('should handle entry without courtIds', () => {
    const entries: TodsDateAvailability[] = [
      {
        date: TEST_DAY,
        startTime: '08:00',
        endTime: '10:00',
        venueId: 'venue-1',
      },
    ];

    const hours = calculateCourtHours(entries);
    expect(hours).toBe(2); // 2 hours x 1 (default)
  });
});
