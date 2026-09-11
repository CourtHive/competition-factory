import { addNotice } from '@Global/state/globalState';

// Constants
import { ErrorType, MISSING_EVENT } from '@Constants/errorConditionConstants';
import { ADD_EVENT, DELETE_EVENT, MODIFY_EVENT } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Event } from '@Types/tournamentTypes';

type EventNoticeArgs = {
  tournamentId?: string;
  event?: Event;
};
type NoticeResult = { success?: boolean; error?: ErrorType };

export function addEventNotice({ tournamentId, event }: EventNoticeArgs): NoticeResult {
  if (!event) {
    return { error: MISSING_EVENT };
  }
  addNotice({
    payload: { tournamentId, event },
    key: event.eventId,
    topic: ADD_EVENT,
  });

  return { ...SUCCESS };
}

/** Dispatch MODIFY_EVENT for a change to event attributes (name, dates, …). */
export function modifyEventNotice({ tournamentId, event }: EventNoticeArgs): NoticeResult {
  if (!event) {
    return { error: MISSING_EVENT };
  }
  addNotice({
    payload: { tournamentId, event },
    key: event.eventId,
    topic: MODIFY_EVENT,
  });

  return { ...SUCCESS };
}

type DeleteEventsNoticeArgs = {
  tournamentId?: string;
  eventIds: string[];
};

/** Dispatch DELETE_EVENT for one or more removed events (keyless, like the other
 *  delete-ids notices). Draw/matchUp/participant cascades are dispatched by the
 *  caller via their own delete notices. */
export function deleteEventsNotice({ tournamentId, eventIds }: DeleteEventsNoticeArgs): NoticeResult {
  addNotice({
    payload: { tournamentId, eventIds },
    topic: DELETE_EVENT,
  });

  return { ...SUCCESS };
}
