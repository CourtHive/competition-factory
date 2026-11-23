import { findCategoryTiming } from '@Acquire/findCategoryTiming';

/**
 * Minimum rest between the last matchUp of one day and the first of the next.
 *
 * Distinct from `getMatchUpFormatRecoveryTimes` in two ways that matter:
 *
 * 1. **It is not per-format.** An overnight rule is a property of the day
 *    boundary, not of what was played — USTA Friend at Court states it as a flat
 *    12 hours for junior divisions regardless of format. So there is no
 *    `matchUpFormat` axis and no `averageMinutes` input.
 * 2. **It is category-dependent.** The 12-hour figure is a *junior* rule; adult
 *    play has no equivalent constraint. That is why this returns a category
 *    timing block rather than a scalar, and why the default policy pairs a
 *    JUNIOR entry with an unconstrained catch-all.
 *
 * Precedence mirrors recovery: event scheduling extension, then tournament
 * scheduling (the CODES `scheduling.timing` group leaf), then the attached or
 * supplied policy, then the caller's default. Absent everywhere, the caller sees
 * `undefined` and must treat it as *no overnight rule configured* rather than
 * substituting a figure of its own — the same contract `getMatchUpDailyLimits`
 * already has.
 */
export function getOvernightRecoveryTimes({
  tournamentScheduling,
  eventScheduling,
  defaultTiming,
  categoryName,
  categoryType,
  policy,
}: {
  tournamentScheduling?: any;
  eventScheduling?: any;
  defaultTiming?: any;
  categoryName?: string;
  categoryType?: string;
  policy?: any;
}) {
  const timesBlockArray = [
    eventScheduling?.overnightTimes,
    tournamentScheduling?.overnightTimes,
    policy?.defaultTimes?.overnightTimes,
    defaultTiming?.overnightTimes,
  ];

  return findCategoryTiming({
    categoryName,
    categoryType,
    timesBlockArray,
  });
}
