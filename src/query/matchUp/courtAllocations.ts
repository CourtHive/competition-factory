import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { ALLOCATE_COURTS } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';

export function matchUpAllocatedCourts({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const { itemValue: allocatedCourts, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: ALLOCATE_COURTS,
  });

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { allocatedCourts: makeDeepCopy(allocatedCourts, false, true) }
    : schedule;
}
