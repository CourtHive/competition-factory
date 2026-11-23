import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { addNotice } from '@Global/state/globalState';
import { getTimeItem } from '@Query/base/timeItems';
import { addTimeItem } from './addTimeItem';

// constants
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { PUBLISH_PARTICIPANTS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { isValidEmbargoDate } from '@Tools/dateTime';
import {
  INVALID_EMBARGO,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
} from '@Constants/errorConditionConstants';

export function publishParticipants(params) {
  const tournamentRecords = resolveTournamentRecords(params);

  if (!Object.keys(tournamentRecords).length) return { error: MISSING_TOURNAMENT_RECORDS };

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = publish({ tournamentRecord, ...params });
    if (result.error) return result;
  }

  return { ...SUCCESS };
}

function publish({ removePriorValues, tournamentRecord, status = PUBLIC, embargo, columns, language }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const itemType = `${PUBLISH}.${STATUS}`;
  const { timeItem } = getTimeItem({ element: tournamentRecord, itemType });
  const itemValue = timeItem?.itemValue || { [status]: {} };
  const participants: any = { published: true };
  if (embargo && !isValidEmbargoDate(embargo)) return { error: INVALID_EMBARGO };
  if (embargo) participants.embargo = embargo;
  if (columns) participants.columns = columns;
  // a record already published under another status holds no entry for this one yet
  itemValue[status] ??= {};
  itemValue[status].participants = participants;
  if (language) itemValue[status].language = language;
  const updatedTimeItem = { itemValue, itemType };

  addTimeItem({
    timeItem: updatedTimeItem,
    element: tournamentRecord,
    removePriorValues,
  });

  addNotice({
    payload: { tournamentId: tournamentRecord.tournamentId },
    topic: PUBLISH_PARTICIPANTS,
  });

  return { ...SUCCESS };
}
