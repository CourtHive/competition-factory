import { getEventTimeItem } from '@Query/base/timeItems';

// constants
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import type { Event } from '@Types/tournamentTypes';

type GetEventPublishStatusArgs = {
  event?: Event;
  status?: string;
};
export function getEventPublishStatus({ event, status = PUBLIC }: GetEventPublishStatusArgs) {
  const itemType = `${PUBLISH}.${STATUS}`;
  return getEventTimeItem({
    itemType,
    event,
  } as Parameters<typeof getEventTimeItem>[0])?.timeItem?.itemValue?.[status];
}
