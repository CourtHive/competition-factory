import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';

// constants and types
import { TIME_MODIFIERS } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';

/**
 * CODES Phase 2 promoted `TIME_MODIFIERS` to first-class `matchUp.schedule.timeModifiers`.
 * Prefer the first-class value; fall back to the legacy timeItem for unmigrated records.
 */
export function matchUpTimeModifiers({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const firstClassTimeModifiers = matchUp?.schedule?.timeModifiers;

  const { itemValue: legacyTimeModifiers, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: TIME_MODIFIERS,
  });

  const timeModifiers = firstClassTimeModifiers ?? legacyTimeModifiers;

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { timeModifiers }
    : schedule;
}
