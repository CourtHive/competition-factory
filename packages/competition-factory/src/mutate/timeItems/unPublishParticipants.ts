import { checkAndNotifyUnpublishTournament } from '@Mutate/publishing/checkAndNotifyUnpublishTournament';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { addNotice } from '@Global/state/globalState';
import { getTimeItem } from '@Query/base/timeItems';
import { addTimeItem } from './addTimeItem';

// constants
import { MISSING_TOURNAMENT_RECORD, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { UNPUBLISH_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function unPublishParticipants(params) {
  const tournamentRecords = resolveTournamentRecords(params);

  if (!Object.keys(tournamentRecords).length) return { error: MISSING_TOURNAMENT_RECORDS };

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = unpublish({ tournamentRecord, ...params });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}

function unpublish({ removePriorValues = true, tournamentRecord, status = PUBLIC }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const itemType = `${PUBLISH}.${STATUS}`;
  const { timeItem } = getTimeItem({ element: tournamentRecord, itemType });
  const itemValue = timeItem?.itemValue || { [status]: {} };
  if (itemValue[status]) delete itemValue[status].participants;
  const updatedTimeItem = { itemValue, itemType };

  addTimeItem({
    timeItem: updatedTimeItem,
    element: tournamentRecord,
    removePriorValues,
  });
  addNotice({
    payload: { tournamentId: tournamentRecord.tournamentId },
    topic: UNPUBLISH_PARTICIPANTS,
  });

  checkAndNotifyUnpublishTournament({ tournamentRecord });

  return { ...SUCCESS };
}
