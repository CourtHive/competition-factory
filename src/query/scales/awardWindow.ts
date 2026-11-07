import { competitionNow } from '@Tools/clock';
import { extractDate } from '@Tools/plainDate';

/**
 * THE ROLLING AWARD WINDOW: the span of award end dates a ranking list is computed over (CA 2026-11-08).
 *
 * One definition, for factory's own filter and for any service that pre-filters its store before calling
 * `generateRankingList` (courthive-rankings did, with its own copy, because factory's window counted results dated after
 * the list's own as-of date). Inclusive at both ends and in calendar days, so it has no time zone and no DST
 * discontinuity:
 *
 * - **upper bound `asOfDate`**: a result after the list's date has not happened as far as that list is concerned;
 * - **lower bound `asOfDate - rollingPeriodDays`**;
 * - **default 365 days** when a list declares none, or declares something that is not a positive finite number.
 *
 * `asOfDate` is the instant the list is judged at, and a clock is an input. In 7.x it falls back to the competition
 * clock's date when omitted.
 */
export const DEFAULT_ROLLING_PERIOD_DAYS = 365;

export type AwardWindow = {
  /** inclusive lower bound on an award's end date, `YYYY-MM-DD` */
  from: string;
  /** inclusive upper bound on an award's end date, `YYYY-MM-DD` */
  to: string;
};

/** a policy's declared rolling period, or the default when it declares none (or an unusable one) */
export function rollingPeriodDaysFrom(aggregationRules?: { rollingPeriodDays?: unknown }): number {
  const declared = aggregationRules?.rollingPeriodDays;
  if (typeof declared !== 'number' || !Number.isFinite(declared) || declared <= 0) return DEFAULT_ROLLING_PERIOD_DAYS;
  return declared;
}

/** the `[from, to]` window for a list dated `asOfDate` (a calendar date or ISO date-time; the competition date if omitted) */
export function computeAwardWindow(
  asOfDate?: string,
  rollingPeriodDays: number = DEFAULT_ROLLING_PERIOD_DAYS,
): AwardWindow {
  const to = extractDate(asOfDate) || extractDate(competitionNow().toISOString());
  const [year, month, day] = to.split('-').map(Number);
  const from = new Date(Date.UTC(year, month - 1, day) - rollingPeriodDays * 86_400_000).toISOString().slice(0, 10);
  return { from, to };
}

/** whether an award's end date falls inside the window; an award with no readable end date is outside it */
export function isAwardInWindow(award: { endDate?: string }, window: AwardWindow): boolean {
  const endDay = extractDate(award?.endDate);
  return !!endDay && endDay >= window.from && endDay <= window.to;
}
