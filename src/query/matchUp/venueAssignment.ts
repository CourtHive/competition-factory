import { latestVisibleTimeItemValue } from '@Query/matchUp/latestVisibleTimeItemValue';

// constants and types
import { ASSIGN_VENUE } from '@Constants/timeItemConstants';
import { ScheduledMatchUpArgs } from '@Types/factoryTypes';

/**
 * CODES Phase 2 promoted `ASSIGN_VENUE` to first-class `matchUp.schedule.venueId`.
 * Prefer the first-class value; fall back to the legacy timeItem for unmigrated records.
 */
export function matchUpAssignedVenueId({ timeStamp, schedule, matchUp }: ScheduledMatchUpArgs) {
  const firstClassVenueId = matchUp?.schedule?.venueId;

  const { itemValue: legacyVenueId, timeStamp: itemTimeStamp } = latestVisibleTimeItemValue({
    timeItems: matchUp?.timeItems ?? [],
    itemType: ASSIGN_VENUE,
  });

  const venueId = firstClassVenueId ?? legacyVenueId;

  return !schedule || (itemTimeStamp && timeStamp && new Date(itemTimeStamp).getTime() > new Date(timeStamp).getTime())
    ? { venueId }
    : schedule;
}
