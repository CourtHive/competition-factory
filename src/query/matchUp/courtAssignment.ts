import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';

// constants and types
import { ASSIGN_COURT } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';

/**
 * CODES Phase 2 promoted `ASSIGN_COURT` to first-class `matchUp.schedule.courtId`.
 * Prefer the first-class value; fall back to the legacy timeItem for unmigrated records.
 */
export function matchUpAssignedCourtId({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const firstClassCourtId = matchUp?.schedule?.courtId;

  const { itemValue: legacyCourtId, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: ASSIGN_COURT,
  });

  const courtId = firstClassCourtId ?? legacyCourtId;

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { courtId }
    : schedule;
}
