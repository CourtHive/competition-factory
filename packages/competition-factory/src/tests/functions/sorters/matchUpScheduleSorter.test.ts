import { matchUpScheduleSort } from '@Functions/sorters/matchUpScheduleSorter';
import { describe, expect, it } from 'vitest';

describe('matchUpScheduleSort', () => {
  // Unit tests for sorting logic

  it('sorts matchUp without scheduledDate before matchUp with (unscheduled first)', () => {
    const matchUps = [
      { matchUpId: 'a', schedule: {} },
      { matchUpId: 'b', schedule: { scheduledDate: '2024-01-01' } },
    ];

    matchUps.sort(matchUpScheduleSort);

    // Unscheduled matchUps sort first
    expect(matchUps[0].matchUpId).toBe('a');
    expect(matchUps[1].matchUpId).toBe('b');
  });

  it('sorts matchUp with scheduledDate after matchUp without', () => {
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: '2024-01-01' } },
      { matchUpId: 'b', schedule: {} },
    ];

    matchUps.sort(matchUpScheduleSort);

    // Unscheduled matchUps sort first
    expect(matchUps[0].matchUpId).toBe('b');
    expect(matchUps[1].matchUpId).toBe('a');
  });

  it('sorts by scheduledDate when both have dates', () => {
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: '2024-01-03' } },
      { matchUpId: 'b', schedule: { scheduledDate: '2024-01-01' } },
      { matchUpId: 'c', schedule: { scheduledDate: '2024-01-02' } },
    ];

    matchUps.sort(matchUpScheduleSort);

    expect(matchUps[0].matchUpId).toBe('b');
    expect(matchUps[1].matchUpId).toBe('c');
    expect(matchUps[2].matchUpId).toBe('a');
  });

  it('sorts by scheduledTime when dates are equal', () => {
    const date = '2024-01-01';
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: date, scheduledTime: '14:00' } },
      { matchUpId: 'b', schedule: { scheduledDate: date, scheduledTime: '09:00' } },
      { matchUpId: 'c', schedule: { scheduledDate: date, scheduledTime: '12:00' } },
    ];

    matchUps.sort(matchUpScheduleSort);

    // Should sort by time when dates are equal
    expect(matchUps[0].matchUpId).toBe('b');
    expect(matchUps[1].matchUpId).toBe('c');
    expect(matchUps[2].matchUpId).toBe('a');
  });

  it('sorts matchUp without time before matchUp with time on same date', () => {
    const date = '2024-01-01';
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: date } },
      { matchUpId: 'b', schedule: { scheduledDate: date, scheduledTime: '09:00' } },
    ];

    matchUps.sort(matchUpScheduleSort);

    // MatchUp without time sorts first when dates are equal
    expect(matchUps[0].matchUpId).toBe('a');
    expect(matchUps[1].matchUpId).toBe('b');
  });

  it('handles missing schedule object', () => {
    const matchUps = [{ matchUpId: 'a', schedule: { scheduledDate: '2024-01-01' } }, { matchUpId: 'b' }];

    matchUps.sort(matchUpScheduleSort);

    // Missing schedule sorts first
    expect(matchUps[0].matchUpId).toBe('b');
    expect(matchUps[1].matchUpId).toBe('a');
  });

  it('handles null schedule', () => {
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: '2024-01-01' } },
      { matchUpId: 'b', schedule: null },
    ];

    matchUps.sort(matchUpScheduleSort);

    // Null schedule sorts first
    expect(matchUps[0].matchUpId).toBe('b');
    expect(matchUps[1].matchUpId).toBe('a');
  });

  it('handles undefined schedule', () => {
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: '2024-01-01' } },
      { matchUpId: 'b', schedule: undefined },
    ];

    matchUps.sort(matchUpScheduleSort);

    // Undefined schedule sorts first
    expect(matchUps[0].matchUpId).toBe('b');
    expect(matchUps[1].matchUpId).toBe('a');
  });

  it('returns 0 for identical schedules', () => {
    const schedule = { scheduledDate: '2024-01-01', scheduledTime: '09:00' };
    const matchUp = { matchUpId: 'a', schedule };

    expect(matchUpScheduleSort(matchUp, matchUp)).toBe(0);
  });

  it('returns 0 for both without schedules', () => {
    const a = { matchUpId: 'a', schedule: {} };
    const b = { matchUpId: 'b', schedule: {} };

    expect(matchUpScheduleSort(a, b)).toBe(0);
  });

  it('handles times with ISO format', () => {
    const date = '2024-01-01';
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: date, scheduledTime: '2024-01-01T14:00:00Z' } },
      { matchUpId: 'b', schedule: { scheduledDate: date, scheduledTime: '2024-01-01T09:00:00Z' } },
    ];

    matchUps.sort(matchUpScheduleSort);

    expect(matchUps[0].matchUpId).toBe('b');
    expect(matchUps[1].matchUpId).toBe('a');
  });

  it('handles times across midnight', () => {
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: '2024-01-01', scheduledTime: '23:30' } },
      { matchUpId: 'b', schedule: { scheduledDate: '2024-01-02', scheduledTime: '00:30' } },
    ];

    matchUps.sort(matchUpScheduleSort);

    // Different dates, so should sort by date
    expect(matchUps[0].matchUpId).toBe('a');
    expect(matchUps[1].matchUpId).toBe('b');
  });

  it('handles same date and time', () => {
    const date = '2024-01-01';
    const time = '09:00';
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: date, scheduledTime: time } },
      { matchUpId: 'b', schedule: { scheduledDate: date, scheduledTime: time } },
    ];

    matchUps.sort(matchUpScheduleSort);

    // Order should remain stable
    expect(matchUps).toHaveLength(2);
  });

  it('handles complex sorting scenario', () => {
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: '2024-01-02', scheduledTime: '10:00' } },
      { matchUpId: 'b', schedule: { scheduledDate: '2024-01-01', scheduledTime: '14:00' } },
      { matchUpId: 'c', schedule: { scheduledDate: '2024-01-01' } }, // No time
      { matchUpId: 'd', schedule: {} }, // No date or time
      { matchUpId: 'e', schedule: { scheduledDate: '2024-01-01', scheduledTime: '09:00' } },
    ];

    matchUps.sort(matchUpScheduleSort);

    // Expected order: d (no date), c (01-01 no time), e (01-01 09:00), b (01-01 14:00), a (01-02 10:00)
    expect(matchUps[0].matchUpId).toBe('d');
    expect(matchUps[1].matchUpId).toBe('c');
    expect(matchUps[2].matchUpId).toBe('e');
    expect(matchUps[3].matchUpId).toBe('b');
    expect(matchUps[4].matchUpId).toBe('a');
  });

  it('handles date strings in different formats', () => {
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: '2024-01-03' } },
      { matchUpId: 'b', schedule: { scheduledDate: '2024/01/01' } },
      { matchUpId: 'c', schedule: { scheduledDate: '2024-01-02' } },
    ];

    matchUps.sort(matchUpScheduleSort);

    // Should parse and sort correctly
    expect(matchUps[0].matchUpId).toBe('b');
    expect(matchUps[1].matchUpId).toBe('c');
    expect(matchUps[2].matchUpId).toBe('a');
  });

  it('handles invalid date strings gracefully', () => {
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: 'invalid-date' } },
      { matchUpId: 'b', schedule: { scheduledDate: '2024-01-01' } },
    ];

    // Should not throw
    matchUps.sort(matchUpScheduleSort);

    expect(matchUps).toHaveLength(2);
  });

  it('handles empty matchUps array', () => {
    const matchUps = [];

    matchUps.sort(matchUpScheduleSort);

    expect(matchUps).toHaveLength(0);
  });

  it('handles single matchUp', () => {
    const matchUps = [{ matchUpId: 'a', schedule: { scheduledDate: '2024-01-01' } }];

    matchUps.sort(matchUpScheduleSort);

    expect(matchUps).toHaveLength(1);
    expect(matchUps[0].matchUpId).toBe('a');
  });

  it('handles times with seconds (converts to minutes)', () => {
    const date = '2024-01-01';
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: date, scheduledTime: '09:30:00' } },
      { matchUpId: 'b', schedule: { scheduledDate: date, scheduledTime: '09:00:00' } },
    ];

    matchUps.sort(matchUpScheduleSort);

    // timeStringMinutes converts to minutes, so 09:00 < 09:30
    expect(matchUps[0].matchUpId).toBe('b');
    expect(matchUps[1].matchUpId).toBe('a');
  });

  it('maintains stable sort for equivalent schedules', () => {
    const date = '2024-01-01';
    const matchUps = [
      { matchUpId: 'a', schedule: { scheduledDate: date } },
      { matchUpId: 'b', schedule: { scheduledDate: date } },
      { matchUpId: 'c', schedule: { scheduledDate: date } },
    ];

    matchUps.sort(matchUpScheduleSort);

    // All have same date, no time - order should be stable
    expect(matchUps).toHaveLength(3);
  });
});
