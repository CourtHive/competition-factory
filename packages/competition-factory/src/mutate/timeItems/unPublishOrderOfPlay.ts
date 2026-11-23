import { checkAndNotifyUnpublishTournament } from '@Mutate/publishing/checkAndNotifyUnpublishTournament';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { addNotice } from '@Global/state/globalState';
import { getTimeItem } from '@Query/base/timeItems';
import { addTimeItem } from './addTimeItem';

// constants
import { MISSING_TOURNAMENT_RECORD, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { UNPUBLISH_ORDER_OF_PLAY } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function unPublishOrderOfPlay(params) {
  const tournamentRecords = resolveTournamentRecords(params);

  if (!Object.keys(tournamentRecords).length) return { error: MISSING_TOURNAMENT_RECORDS };

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = unPublishOOP({ tournamentRecord, ...params });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}

function unPublishOOP({ removePriorValues = true, tournamentRecord, status = PUBLIC }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const itemType = `${PUBLISH}.${STATUS}`;
  const { timeItem } = getTimeItem({ element: tournamentRecord, itemType });
  const itemValue = timeItem?.itemValue || { [status]: {} };
  if (itemValue[status]) delete itemValue[status].orderOfPlay;
  const updatedTimeItem = { itemValue, itemType };

  addTimeItem({
    timeItem: updatedTimeItem,
    element: tournamentRecord,
    removePriorValues,
  });
  addNotice({
    topic: UNPUBLISH_ORDER_OF_PLAY,
    payload: {
      tournamentId: tournamentRecord.tournamentId,
    },
  });

  checkAndNotifyUnpublishTournament({ tournamentRecord });

  return { ...SUCCESS };
}
