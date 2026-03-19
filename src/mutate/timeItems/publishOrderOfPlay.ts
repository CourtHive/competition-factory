import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { addNotice } from '@Global/state/globalState';
import { isValidEmbargoDate } from '@Tools/dateTime';
import { getTimeItem } from '@Query/base/timeItems';
import { addTimeItem } from './addTimeItem';

// constants
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { PUBLISH_ORDER_OF_PLAY } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_EMBARGO,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
} from '@Constants/errorConditionConstants';

export function publishOrderOfPlay(params) {
  const tournamentRecords = resolveTournamentRecords(params);

  if (!Object.keys(tournamentRecords).length) return { error: MISSING_TOURNAMENT_RECORDS };

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = publishOOP({ tournamentRecord, ...params });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}

function publishOOP({
  scheduledDates,
  removePriorValues,
  tournamentRecord,
  status = PUBLIC,
  eventIds,
  embargo,
  language,
}) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const itemType = `${PUBLISH}.${STATUS}`;
  const { timeItem } = getTimeItem({ element: tournamentRecord, itemType });
  const itemValue = timeItem?.itemValue || { [status]: {} };
  const orderOfPlay: any = { published: true };
  // Only set scheduledDates/eventIds when explicitly provided;
  // omitting them means "all dates/events" (no filtering).
  if (scheduledDates !== undefined) orderOfPlay.scheduledDates = scheduledDates;
  if (eventIds !== undefined) orderOfPlay.eventIds = eventIds;
  if (embargo && !isValidEmbargoDate(embargo)) return { error: INVALID_EMBARGO };
  if (embargo) orderOfPlay.embargo = embargo;
  itemValue[status].orderOfPlay = orderOfPlay;
  if (language) itemValue[status].language = language;
  const updatedTimeItem = { itemValue, itemType };

  addTimeItem({
    timeItem: updatedTimeItem,
    element: tournamentRecord,
    removePriorValues,
  });

  addNotice({
    topic: PUBLISH_ORDER_OF_PLAY,
    payload: {
      tournamentId: tournamentRecord.tournamentId,
      scheduledDates,
      eventIds,
    },
  });

  return { ...SUCCESS };
}
