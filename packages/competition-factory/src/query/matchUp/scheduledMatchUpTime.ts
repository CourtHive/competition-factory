import { latestVisibleTimeItemValue } from './latestVisibleTimeItemValue';

// constants and types
import { SCHEDULED_TIME } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';

/**
 * CODES Phase 2 promoted `SCHEDULED_TIME` to first-class `matchUp.schedule.scheduledTime`.
 * Prefer the first-class value; fall back to the legacy timeItem for unmigrated records.
 */
export function scheduledMatchUpTime({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const firstClassTime = matchUp?.schedule?.scheduledTime;

  const { itemValue: legacyTime, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: SCHEDULED_TIME,
  });

  const scheduledTime = firstClassTime ?? legacyTime;

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { scheduledTime }
    : schedule;
}
