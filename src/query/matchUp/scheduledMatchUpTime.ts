import { latestVisibleTimeItemValue } from './latestVisibleTimeItemValue';

// constants and types
import { SCHEDULED_TIME } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';

export function scheduledMatchUpTime({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const { itemValue: scheduledTime, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: SCHEDULED_TIME,
  });

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { scheduledTime }
    : schedule;
}
