import { matchUpScheduleSort } from '@Functions/sorters/matchUpScheduleSorter';
import { describe, expect, it } from 'vitest';

// Regression coverage for the calendar-day (timezone-free) date comparison.
// Previously the sorter compared `new Date(scheduledDate).getTime()`, which parses
// 'YYYY-MM-DD' as UTC-midnight but 'YYYY-MM-DDTHH:MM' as local — a parse-mode
// mismatch that could flip ordering across midnight. The sorter now compares the
// extracted calendar-day portion lexically.
describe('matchUpScheduleSort calendar-day comparison', () => {
  it('orders by calendar day regardless of an embedded time component', () => {
    const a = { schedule: { scheduledDate: '2026-07-11' } };
    const b = { schedule: { scheduledDate: '2026-07-10T23:00' } };
    // 2026-07-10 precedes 2026-07-11 by calendar day
    expect(matchUpScheduleSort(a, b)).toBeGreaterThan(0);
    expect(matchUpScheduleSort(b, a)).toBeLessThan(0);
  });

  it('treats a date-only and a same-day date+time value as the same calendar day', () => {
    // Old behavior: new Date('2026-07-10T05:00') > new Date('2026-07-10') → non-zero.
    // New behavior: both extract to '2026-07-10' → equal.
    const a = { schedule: { scheduledDate: '2026-07-10T05:00' } };
    const b = { schedule: { scheduledDate: '2026-07-10' } };
    expect(matchUpScheduleSort(a, b)).toBe(0);
  });

  it('produces stable chronological ordering across multiple days', () => {
    const matchUps = [
      { schedule: { scheduledDate: '2026-07-12' } },
      { schedule: { scheduledDate: '2026-07-10' } },
      { schedule: { scheduledDate: '2026-07-11' } },
    ];
    matchUps.sort(matchUpScheduleSort);
    expect(matchUps.map((m) => m.schedule.scheduledDate)).toEqual(['2026-07-10', '2026-07-11', '2026-07-12']);
  });
});
