import {
  computeAwardWindow,
  DEFAULT_ROLLING_PERIOD_DAYS,
  isAwardInWindow,
  rollingPeriodDaysFrom,
} from '@Query/scales/awardWindow';
import { generateRankingList } from '@Query/scales/generateRankingList';
import { afterEach, describe, expect, it } from 'vitest';
import { setClock } from '@Tools/clock';

/**
 * THE ROLLING AWARD WINDOW (CA 2026-11-08): inclusive [asOfDate - rollingPeriodDays, asOfDate] in calendar days, 365 days
 * by default, the competition clock's date when asOfDate is omitted. Factory's window had no upper bound, so a list dated
 * in the past counted results that had not happened yet.
 */
afterEach(() => setClock());

describe('computeAwardWindow', () => {
  it('ends at asOfDate and reaches back rollingPeriodDays, in calendar days', () => {
    expect(computeAwardWindow('2025-07-01', 365)).toEqual({ from: '2024-07-01', to: '2025-07-01' });
    expect(computeAwardWindow('2025-07-01T23:59:00Z', 30)).toEqual({ from: '2025-06-01', to: '2025-07-01' });
  });

  it('crosses a DST change and a leap day without shifting a bound', () => {
    expect(computeAwardWindow('2026-03-30', 1)).toEqual({ from: '2026-03-29', to: '2026-03-30' });
    expect(computeAwardWindow('2024-03-01', 1)).toEqual({ from: '2024-02-29', to: '2024-03-01' });
  });

  it('defaults to 365 days, and to the competition clock date', () => {
    setClock('2026-11-08T10:00:00Z');
    expect(computeAwardWindow()).toEqual({ from: '2025-11-08', to: '2026-11-08' });
    expect(DEFAULT_ROLLING_PERIOD_DAYS).toEqual(365);
  });
});

describe('rollingPeriodDaysFrom', () => {
  it.each([
    [{ rollingPeriodDays: 364 }, 364],
    [{}, 365],
    [undefined, 365],
    [{ rollingPeriodDays: 0 }, 365],
    [{ rollingPeriodDays: -7 }, 365],
    [{ rollingPeriodDays: Number.POSITIVE_INFINITY }, 365],
    [{ rollingPeriodDays: '364' }, 365],
  ])('%j -> %s', (rules, days) => {
    expect(rollingPeriodDaysFrom(rules as any)).toEqual(days);
  });
});

describe('isAwardInWindow', () => {
  const window = { from: '2024-07-01', to: '2025-07-01' };
  it.each([
    ['2024-07-01', true],
    ['2025-07-01', true],
    ['2025-07-01T18:00:00Z', true],
    ['2024-06-30', false],
    ['2025-07-02', false],
    [undefined, false],
    ['not a date', false],
  ])('endDate %s -> %s', (endDate, inside) => {
    expect(isAwardInWindow({ endDate }, window)).toEqual(inside);
  });
});

describe('generateRankingList applies the window', () => {
  const award = (endDate: string, points: number) => ({ personId: 'p1', eventType: 'SINGLES', points, endDate });

  it('does not count a result dated after the list', () => {
    const entries = generateRankingList({
      pointAwards: [award('2025-06-01', 200), award('2025-08-01', 900)],
      aggregationRules: { rollingPeriodDays: 365 },
      asOfDate: '2025-07-01',
    });
    expect(entries.find((entry) => entry.personId === 'p1')?.totalPoints).toEqual(200);
  });
});
