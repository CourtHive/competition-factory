import { checkAndNotifyUnpublishTournament } from '@Mutate/publishing/checkAndNotifyUnpublishTournament';
import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { addNotice } from '@Global/state/globalState';
import { getTimeItem } from '@Query/base/timeItems';
import { addTimeItem } from './addTimeItem';

// constants
import { MISSING_TOURNAMENT_RECORD, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { UNPUBLISH_TOURNAMENT_INFO } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

/**
 * Withdraw a tournament's information publish. The tournament stays public if any other component —
 * a published event draw, the order of play, the participant list — is still published.
 */
export function unPublishTournamentInfo(params) {
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
  if (itemValue[status]) delete itemValue[status].info;

  addTimeItem({
    timeItem: { itemValue, itemType },
    element: tournamentRecord,
    removePriorValues,
  });
  addNotice({
    payload: { tournamentId: tournamentRecord.tournamentId },
    topic: UNPUBLISH_TOURNAMENT_INFO,
  });

  checkAndNotifyUnpublishTournament({ tournamentRecord });

  return { ...SUCCESS };
}
