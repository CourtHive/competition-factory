import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';

// constants and types
import { TIME_MODIFIERS } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';

export function matchUpTimeModifiers({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const { itemValue: timeModifiers, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: TIME_MODIFIERS,
  });

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { timeModifiers }
    : schedule;
}
