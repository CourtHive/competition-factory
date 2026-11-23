import { HydratedMatchUp } from '@Types/hydrated';

/**
 * Sort matchUps by (scheduledDate, scheduledTime) when BOTH compared
 * matchUps carry the relevant field; otherwise return 0 so a stable
 * sort preserves the caller's input order.
 *
 * This is intentionally narrower than `matchUpScheduleSort`, which
 * actively reorders unscheduled matchUps relative to scheduled ones.
 * The pro scheduler walks the input array in order to assign earlier
 * times to earlier grid rows when Garman has pre-assigned times; for
 * fresh runs without times (e.g. proConflicts fixtures), the
 * comparator must be a no-op so input order — typically the canonical
 * `matchUpSort` ordering — survives.
 */
export function matchUpChronologicalSort(a: HydratedMatchUp, b: HydratedMatchUp): number {
  const aDate = a?.schedule?.scheduledDate;
  const bDate = b?.schedule?.scheduledDate;
  const aTime = a?.schedule?.scheduledTime;
  const bTime = b?.schedule?.scheduledTime;
  if (aDate && bDate) {
    if (aDate !== bDate) return aDate.localeCompare(bDate);
    if (aTime && bTime && aTime !== bTime) return aTime.localeCompare(bTime);
  }
  return 0;
}
