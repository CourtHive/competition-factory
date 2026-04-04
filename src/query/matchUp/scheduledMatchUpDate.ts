import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';

// constants and types
import { SCHEDULED_DATE } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';

export function scheduledMatchUpDate({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const { itemValue: scheduledDate, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: SCHEDULED_DATE,
  });

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { scheduledDate }
    : schedule;
}
