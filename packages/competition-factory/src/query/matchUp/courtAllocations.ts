import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { ALLOCATE_COURTS } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';

/**
 * CODES Phase 2 promoted `ALLOCATE_COURTS` to first-class `matchUp.schedule.allocatedCourts`.
 * Prefer the first-class value; fall back to the legacy timeItem for unmigrated records.
 */
export function matchUpAllocatedCourts({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const firstClassAllocatedCourts = matchUp?.schedule?.allocatedCourts;

  const { itemValue: legacyAllocatedCourts, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: ALLOCATE_COURTS,
  });

  const allocatedCourts = firstClassAllocatedCourts ?? legacyAllocatedCourts;

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { allocatedCourts: makeDeepCopy(allocatedCourts, false, true) }
    : schedule;
}
