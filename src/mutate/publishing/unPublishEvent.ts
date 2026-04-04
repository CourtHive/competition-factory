import { checkAndNotifyUnpublishTournament } from './checkAndNotifyUnpublishTournament';
import { modifyEventPublishStatus } from '../events/modifyEventPublishStatus';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addEventTimeItem } from '../timeItems/addTimeItem';
import { getEventTimeItem } from '@Query/base/timeItems';
import { addNotice } from '@Global/state/globalState';

import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { UNPUBLISH_EVENT } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function unPublishEvent({ removePriorValues = true, tournamentRecord, status = PUBLIC, event }) {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  const itemType = `${PUBLISH}.${STATUS}`;

  const { timeItem } = getEventTimeItem({
    itemType,
    event,
  });

  const itemValue = timeItem?.itemValue || { [status]: {} };
  delete itemValue[status].structureIds; // legacy
  delete itemValue[status].drawDetails;
  delete itemValue[status].drawIds; // legacy

  const updatedTimeItem = { itemValue, itemType };

  addEventTimeItem({ event, timeItem: updatedTimeItem, removePriorValues });

  modifyEventPublishStatus({
    statusObject: {
      structureIds: undefined,
      drawIds: undefined,
      seeding: undefined,
    },
    removePriorValues,
    status,
    event,
  });

  addNotice({
    topic: UNPUBLISH_EVENT,
    payload: {
      tournamentId: tournamentRecord.tournamentId,
      eventId: event.eventId,
    },
  });

  checkAndNotifyUnpublishTournament({ tournamentRecord });

  return { eventId: event.eventId, ...SUCCESS };
}
