import { END_TIME } from '@Constants/timeItemConstants';

/**
 * A matchUp's end of play: a first-class `schedule.endTime`, else the latest END_TIME timeItem, the last of those with
 * the same stamp, as every other schedule attribute reads its timeItems (CA 2026-10-26, hydration OPEN-9).
 */
export function matchUpEndTime({ matchUp }) {
  const firstClass = matchUp?.schedule?.endTime;
  if (firstClass !== undefined && firstClass !== null && firstClass !== '') return { endTime: firstClass };
  const timeItems = matchUp?.timeItems ?? [];
  const getTimeStamp = (item) => (!item.createdAt ? 0 : new Date(item.createdAt).getTime());
  const endTimeItem = timeItems.reduce((endTimeItem, timeItem) => {
    const endTimeCandidate = timeItem.itemType === END_TIME && timeItem;
    const laterOrSame =
      endTimeCandidate && (!endTimeItem || getTimeStamp(endTimeCandidate) >= getTimeStamp(endTimeItem));
    return laterOrSame ? endTimeCandidate : endTimeItem;
  }, undefined);

  const endTime = endTimeItem?.itemValue;

  return { endTime };
}
