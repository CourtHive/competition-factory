import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { addNotice } from '@Global/state/globalState';
import { getTimeItem } from '@Query/base/timeItems';
import { addTimeItem } from './addTimeItem';
import { isString } from '@Tools/objects';

// constants
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { PUBLISH_TOURNAMENT_INFO } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EVENT_NOT_FOUND,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
} from '@Constants/errorConditionConstants';

// types
import type { Tournament } from '@Types/tournamentTypes';

/**
 * Publish a tournament's INFORMATION — the tournament itself, before anything inside it is public.
 *
 * Until this existed a tournament was public only as a roll-up of its components (an event with a
 * published draw, the order of play, the participant list), so a tournament with no draw could not be
 * public at all: not listed, no information page, no way to register. Publishing information makes the
 * tournament public and exposes its event LIST; draws, entries and matchUps still need their own publish.
 *
 * `eventIds` scopes which events the information page lists. Omitted, every event is listed —
 * including events added later. Publishing information never opens registration: the registration
 * window is `registrationProfile.entriesOpen` / `entriesClose`, and this touches neither.
 */
export function publishTournamentInfo(params) {
  const tournamentRecords = resolveTournamentRecords(params);

  if (!Object.keys(tournamentRecords).length) return { error: MISSING_TOURNAMENT_RECORDS };

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = setTournamentInfoPublishState({ ...params, tournamentRecord });
    if (result.error) return result;

    addNotice({
      payload: { tournamentId: tournamentRecord.tournamentId },
      topic: PUBLISH_TOURNAMENT_INFO,
    });
  }

  return { ...SUCCESS };
}

type SetTournamentInfoPublishStateArgs = {
  tournamentRecord: Tournament;
  removePriorValues?: boolean;
  eventIds?: string[];
  status?: string;
};

/**
 * Write the information publish state onto a record, emitting nothing. Shared by `publishTournamentInfo`
 * and by `activateFromSanctioning`, which builds a record that is not yet in any engine's state.
 */
export function setTournamentInfoPublishState({
  removePriorValues,
  tournamentRecord,
  status = PUBLIC,
  eventIds,
}: SetTournamentInfoPublishStateArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  if (eventIds !== undefined) {
    if (!Array.isArray(eventIds) || !eventIds.every(isString)) {
      return { error: INVALID_VALUES, context: { eventIds } };
    }
    const tournamentEventIds = new Set((tournamentRecord.events ?? []).map((event) => event.eventId));
    const unknownEventIds = eventIds.filter((eventId) => !tournamentEventIds.has(eventId));
    if (unknownEventIds.length) return { error: EVENT_NOT_FOUND, context: { eventIds: unknownEventIds } };
  }

  const itemType = `${PUBLISH}.${STATUS}`;
  const { timeItem } = getTimeItem({ element: tournamentRecord, itemType });
  const itemValue = timeItem?.itemValue || { [status]: {} };
  itemValue[status] ??= {};

  const info: any = { published: true };
  // Only set eventIds when explicitly provided; omitting them means every event.
  if (eventIds !== undefined) info.eventIds = [...eventIds];
  itemValue[status].info = info;

  addTimeItem({
    timeItem: { itemValue, itemType },
    element: tournamentRecord,
    removePriorValues,
  });

  return { ...SUCCESS };
}
