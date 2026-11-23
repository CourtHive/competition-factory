import { getEventTimeItem } from '@Query/base/timeItems';

// constants
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';

export function getEventPublishStatus({ event, status = PUBLIC }) {
  const itemType = `${PUBLISH}.${STATUS}`;
  return getEventTimeItem({
    itemType,
    event,
  })?.timeItem?.itemValue?.[status];
}
