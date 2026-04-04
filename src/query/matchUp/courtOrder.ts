import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';

// constants and types
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';
import { COURT_ORDER } from '@Constants/timeItemConstants';

export function matchUpCourtOrder({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const { itemValue: courtOrder, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: COURT_ORDER,
  });

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { courtOrder }
    : schedule;
}
