import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';

// constants and types
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';
import { COURT_ORDER } from '@Constants/timeItemConstants';

/**
 * CODES Phase 2 promoted `COURT_ORDER` to first-class `matchUp.schedule.courtOrder`.
 * Prefer the first-class value; fall back to the legacy timeItem for unmigrated records.
 */
export function matchUpCourtOrder({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const firstClassCourtOrder = matchUp?.schedule?.courtOrder;

  const { itemValue: legacyCourtOrder, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: COURT_ORDER,
  });

  const courtOrder = firstClassCourtOrder ?? legacyCourtOrder;

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { courtOrder }
    : schedule;
}
