import { addNotice } from '@Global/state/globalState';

// constants and types
import { MODIFY_DRAW_ENTRIES, MODIFY_EVENT_ENTRIES } from '@Constants/topicConstants';
import { DrawDefinition, Event } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type ModifyEventEntriesNoticeArgs = {
  tournamentId?: string;
  event: Event;
};

/**
 * Dispatch MODIFY_EVENT_ENTRIES for a change to `event.entries`. Keyed by
 * eventId so repeated entry mutations on one event in a cycle deliver a single
 * deduped notice (mirrors the draw-notice dedup pattern). The topic has existed
 * in topicConstants since before this helper but was never dispatched.
 */
export function modifyEventEntriesNotice({ event, tournamentId }: ModifyEventEntriesNoticeArgs) {
  if (!event?.eventId) return { ...SUCCESS };
  addNotice({
    topic: MODIFY_EVENT_ENTRIES,
    payload: { tournamentId, eventId: event.eventId, entries: event.entries ?? [] },
    key: event.eventId,
  });
  return { ...SUCCESS };
}

type ModifyDrawEntriesNoticeArgs = {
  drawDefinition: DrawDefinition;
  tournamentId?: string;
  eventId?: string;
};

/** Dispatch MODIFY_DRAW_ENTRIES for a change to `drawDefinition.entries`. */
export function modifyDrawEntriesNotice({ drawDefinition, tournamentId, eventId }: ModifyDrawEntriesNoticeArgs) {
  if (!drawDefinition?.drawId) return { ...SUCCESS };
  addNotice({
    topic: MODIFY_DRAW_ENTRIES,
    payload: { tournamentId, eventId, drawId: drawDefinition.drawId, drawEntries: drawDefinition.entries ?? [] },
    key: drawDefinition.drawId,
  });
  return { ...SUCCESS };
}
