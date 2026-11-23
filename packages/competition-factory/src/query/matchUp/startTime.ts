import { START_TIME } from '@Constants/timeItemConstants';

export function matchUpStartTime({ matchUp }) {
  const timeItems = matchUp?.timeItems ?? [];
  const getTimeStamp = (item) => (!item.createdAt ? 0 : new Date(item.createdAt).getTime());
  const startTimeItem = timeItems.reduce((startTimeItem, timeItem) => {
    const startTimeCandidate = timeItem.itemType === START_TIME && timeItem;
    const earlierStartTimeItem =
      startTimeCandidate && (!startTimeItem || getTimeStamp(startTimeCandidate) < getTimeStamp(startTimeItem));
    return earlierStartTimeItem ? startTimeCandidate : startTimeItem;
  }, undefined);

  const startTime = startTimeItem?.itemValue;

  return { startTime };
}
