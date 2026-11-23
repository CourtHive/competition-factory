import { mergeFacilitySchedule } from '@Query/facilitySchedule/mergeFacilitySchedule';
import { expect, it, describe } from 'vitest';

// types
import { ScheduleCell } from '@Types/facilityScheduleTypes';

const cell = (overrides: Partial<ScheduleCell> & Pick<ScheduleCell, 'matchUpId' | 'tournamentId'>): ScheduleCell => ({
  venueId: 'v1',
  courtId: 'v1c-1',
  scheduledDate: '2025-01-01',
  labels: [],
  ...overrides,
});

describe('mergeFacilitySchedule', () => {
  it('places cells into a venue → court → date grid', () => {
    const a = cell({ matchUpId: 'a', tournamentId: 't1', courtOrder: 1, scheduledTime: '09:00' });
    const b = cell({ matchUpId: 'b', tournamentId: 't1', courtId: 'v1c-2', courtOrder: 1, scheduledTime: '09:00' });

    const grid = mergeFacilitySchedule({ projections: [[a, b]] });

    expect(Object.keys(grid.venues)).toEqual(['v1']);
    expect(Object.keys(grid.venues.v1.courts).sort()).toEqual(['v1c-1', 'v1c-2']);
    expect(grid.venues.v1.courts['v1c-1'].dates['2025-01-01']).toHaveLength(1);
    expect(grid.venues.v1.courts['v1c-2'].dates['2025-01-01']).toHaveLength(1);
    expect(grid.conflicts).toEqual([]);
    expect(grid.unplaced).toEqual([]);
  });

  it('sorts cells on a court by courtOrder then scheduledTime, undefined order last', () => {
    const a = cell({ matchUpId: 'a', tournamentId: 't1', courtOrder: 2, scheduledTime: '11:00' });
    const b = cell({ matchUpId: 'b', tournamentId: 't1', courtOrder: 1, scheduledTime: '09:00' });
    const c = cell({ matchUpId: 'c', tournamentId: 't1', scheduledTime: '08:00' }); // no courtOrder → last
    const d = cell({ matchUpId: 'd', tournamentId: 't1', courtOrder: 1, scheduledTime: '08:00' });

    const grid = mergeFacilitySchedule({ projections: [[a, b, c, d]] });
    const ordered = grid.venues.v1.courts['v1c-1'].dates['2025-01-01'].map((entry) => entry.matchUpId);
    expect(ordered).toEqual(['d', 'b', 'a', 'c']);
  });

  it('sorts cells with the same courtOrder but a missing scheduledTime', () => {
    const withTime = cell({ matchUpId: 'a', tournamentId: 't1', courtOrder: 1, scheduledTime: '09:00' });
    const noTime = cell({ matchUpId: 'b', tournamentId: 't1', courtOrder: 1, scheduledTime: undefined });

    const grid = mergeFacilitySchedule({ projections: [[withTime, noTime]] });
    const ordered = grid.venues.v1.courts['v1c-1'].dates['2025-01-01'].map((entry) => entry.matchUpId);
    // '' (missing time) sorts before '09:00'
    expect(ordered).toEqual(['b', 'a']);
  });

  it('detects a cross-tournament SAME_COURT_ORDER double-booking', () => {
    const a = cell({ matchUpId: 'a', tournamentId: 't1', courtOrder: 1, scheduledTime: '09:00' });
    const b = cell({ matchUpId: 'b', tournamentId: 't2', courtOrder: 1, scheduledTime: '10:30' });

    const grid = mergeFacilitySchedule({ projections: [[a], [b]] });

    expect(grid.conflicts).toHaveLength(1);
    const conflict = grid.conflicts[0];
    expect(conflict.reason).toEqual('SAME_COURT_ORDER');
    expect(conflict.courtOrder).toEqual(1);
    expect(conflict.matchUpIds.sort()).toEqual(['a', 'b']);
    expect(conflict.tournamentIds.sort()).toEqual(['t1', 't2']);
    expect(conflict.venueId).toEqual('v1');
    expect(conflict.courtId).toEqual('v1c-1');
    expect(conflict.scheduledDate).toEqual('2025-01-01');
  });

  it('detects a SAME_SCHEDULED_TIME double-booking', () => {
    const a = cell({ matchUpId: 'a', tournamentId: 't1', courtOrder: 1, scheduledTime: '09:00' });
    const b = cell({ matchUpId: 'b', tournamentId: 't2', courtOrder: 2, scheduledTime: '09:00' });

    const grid = mergeFacilitySchedule({ projections: [[a, b]] });
    const reasons = grid.conflicts.map((conflict) => conflict.reason);
    expect(reasons).toContain('SAME_SCHEDULED_TIME');
    const timeConflict = grid.conflicts.find((conflict) => conflict.reason === 'SAME_SCHEDULED_TIME')!;
    expect(timeConflict.scheduledTime).toEqual('09:00');
    expect(timeConflict.matchUpIds.sort()).toEqual(['a', 'b']);
  });

  it('does not conflict distinct courtOrders/times on the same court', () => {
    const a = cell({ matchUpId: 'a', tournamentId: 't1', courtOrder: 1, scheduledTime: '09:00' });
    const b = cell({ matchUpId: 'b', tournamentId: 't1', courtOrder: 2, scheduledTime: '10:30' });
    const grid = mergeFacilitySchedule({ projections: [[a, b]] });
    expect(grid.conflicts).toEqual([]);
  });

  it('de-duplicates the same matchUp appearing in multiple projections (embed-by-copy)', () => {
    const a1 = cell({ matchUpId: 'a', tournamentId: 't1', courtOrder: 1, scheduledTime: '09:00' });
    const a2 = cell({ matchUpId: 'a', tournamentId: 't1', courtOrder: 1, scheduledTime: '09:00' });

    const grid = mergeFacilitySchedule({ projections: [[a1], [a2]] });
    // counted once, and therefore cannot collide with itself
    expect(grid.venues.v1.courts['v1c-1'].dates['2025-01-01']).toHaveLength(1);
    expect(grid.conflicts).toEqual([]);
  });

  it('routes cells missing venue/court/date to unplaced', () => {
    const noCourt = cell({ matchUpId: 'a', tournamentId: 't1', courtId: undefined, scheduledTime: '09:00' });
    const noDate = cell({ matchUpId: 'b', tournamentId: 't1', scheduledDate: undefined });
    const placed = cell({ matchUpId: 'c', tournamentId: 't1', courtOrder: 1 });

    const grid = mergeFacilitySchedule({ projections: [[noCourt, noDate, placed]] });
    expect(grid.unplaced.map((entry) => entry.matchUpId).sort()).toEqual(['a', 'b']);
    expect(grid.venues.v1.courts['v1c-1'].dates['2025-01-01']).toHaveLength(1);
  });

  it('is defensive about missing/invalid input', () => {
    expect(mergeFacilitySchedule({})).toEqual({ venues: {}, conflicts: [], unplaced: [] });
    // a non-array projection entry is skipped rather than throwing
    const grid = mergeFacilitySchedule({ projections: [null as any, [cell({ matchUpId: 'a', tournamentId: 't1' })]] });
    expect(grid.unplaced).toEqual([]);
    expect(grid.venues.v1.courts['v1c-1'].dates['2025-01-01']).toHaveLength(1);
  });
});
