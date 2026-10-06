import { getEventPublishStatus } from '@Query/event/getEventPublishStatus';
import { addEventTimeItem } from '@Mutate/timeItems/addTimeItem';
import { getEventTimeItem } from '@Query/base/timeItems';
import { isObject } from '@Tools/objects';

// constants and types
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { Event } from '@Types/tournamentTypes';

type ModifyEventPublishStatus = {
  statusObject: { [key: string]: unknown };
  removePriorValues?: boolean;
  status?: string;
  event?: Event;
};

export function modifyEventPublishStatus({
  removePriorValues = true,
  status = PUBLIC,
  statusObject,
  event,
}: ModifyEventPublishStatus) {
  if (!isObject(statusObject)) return { error: INVALID_VALUES };
  const publishStatus = getEventPublishStatus({ event, status });
  const itemType = `${PUBLISH}.${STATUS}`;
  // the time item holds every status; modifying one must carry the others forward
  const otherStatuses = event && getEventTimeItem({ event, itemType })?.timeItem?.itemValue;
  const updatedTimeItem = {
    itemValue: { ...otherStatuses, [status]: { ...publishStatus, ...statusObject } },
    itemType,
  };

  return addEventTimeItem({
    timeItem: updatedTimeItem,
    removePriorValues,
    event,
  });
}
