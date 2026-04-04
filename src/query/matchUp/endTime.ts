import { END_TIME } from '@Constants/timeItemConstants';

export function matchUpEndTime({ matchUp }) {
  const timeItems = matchUp?.timeItems ?? [];
  const getTimeStamp = (item) => (!item.createdAt ? 0 : new Date(item.createdAt).getTime());
  const endTimeItem = timeItems.reduce((endTimeItem, timeItem) => {
    const endTimeCandidate = timeItem.itemType === END_TIME && timeItem;
    const earlierStartTimeItem =
      endTimeCandidate && (!endTimeItem || getTimeStamp(endTimeCandidate) > getTimeStamp(endTimeItem));
    return earlierStartTimeItem ? endTimeCandidate : endTimeItem;
  }, undefined);

  const endTime = endTimeItem?.itemValue;

  return { endTime };
}
