import { matchUpChronologicalSort } from '@Functions/sorters/matchUpChronologicalSort';
import { describe, expect, it } from 'vitest';

describe('matchUpChronologicalSort', () => {
  it('sorts by scheduledDate when both matchUps have a date', () => {
    let matchUps: any = [
      { matchUpId: 'a', schedule: { scheduledDate: '2024-01-03' } },
      { matchUpId: 'b', schedule: { scheduledDate: '2024-01-01' } },
      { matchUpId: 'c', schedule: { scheduledDate: '2024-01-02' } },
    ];

    matchUps.sort(matchUpChronologicalSort);

    expect(matchUps.map((m: any) => m.matchUpId)).toEqual(['b', 'c', 'a']);
  });

  it('breaks ties on scheduledTime when dates are equal and both have times', () => {
    let matchUps: any = [
      { matchUpId: 'a', schedule: { scheduledDate: '2024-01-01', scheduledTime: '14:00' } },
      { matchUpId: 'b', schedule: { scheduledDate: '2024-01-01', scheduledTime: '09:30' } },
      { matchUpId: 'c', schedule: { scheduledDate: '2024-01-01', scheduledTime: '12:00' } },
    ];

    matchUps.sort(matchUpChronologicalSort);

    expect(matchUps.map((m: any) => m.matchUpId)).toEqual(['b', 'c', 'a']);
  });

  it('returns 0 when either matchUp is missing a scheduledDate (stable sort preserves input order)', () => {
    let matchUps: any = [
      { matchUpId: 'a' },
      { matchUpId: 'b', schedule: { scheduledDate: '2024-01-01' } },
      { matchUpId: 'c', schedule: {} },
      { matchUpId: 'd', schedule: { scheduledDate: '2024-01-02' } },
    ];

    matchUps.sort(matchUpChronologicalSort);

    // No comparison returns non-zero (every pair has at least one side lacking
    // a scheduledDate), so a stable sort leaves input order intact.
    expect(matchUps.map((m: any) => m.matchUpId)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('does not reorder on time alone when scheduledDate is missing on one side', () => {
    let matchUps: any = [
      { matchUpId: 'a', schedule: { scheduledTime: '14:00' } },
      { matchUpId: 'b', schedule: { scheduledTime: '09:30' } },
    ];

    matchUps.sort(matchUpChronologicalSort);

    expect(matchUps.map((m: any) => m.matchUpId)).toEqual(['a', 'b']);
  });

  it('returns 0 when dates are equal but a scheduledTime is missing on one side', () => {
    const withTime: any = { schedule: { scheduledDate: '2024-01-01', scheduledTime: '14:00' } };
    const withoutTime: any = { schedule: { scheduledDate: '2024-01-01' } };

    expect(matchUpChronologicalSort(withTime, withoutTime)).toBe(0);
    expect(matchUpChronologicalSort(withoutTime, withTime)).toBe(0);
  });

  it('returns 0 for identical matchUps', () => {
    const matchUp: any = { schedule: { scheduledDate: '2024-01-01', scheduledTime: '10:00' } };
    expect(matchUpChronologicalSort(matchUp, matchUp)).toBe(0);
  });
});
