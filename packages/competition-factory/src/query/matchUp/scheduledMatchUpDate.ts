import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';

// constants and types
import { SCHEDULED_DATE } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';

/**
 * CODES Phase 2 promoted `SCHEDULED_DATE` from `matchUp.timeItems[]` to the
 * first-class attribute `matchUp.schedule.scheduledDate`. Prefer the
 * first-class value; fall back to the legacy timeItem only when first-class
 * isn't populated (pre-CODES records that haven't been migrated yet).
 */
export function scheduledMatchUpDate({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const firstClassDate = matchUp?.schedule?.scheduledDate;

  const { itemValue: legacyDate, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: SCHEDULED_DATE,
  });

  const scheduledDate = firstClassDate ?? legacyDate;

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { scheduledDate }
    : schedule;
}
