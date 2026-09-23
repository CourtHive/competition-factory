import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { addNotice } from '@Global/state/globalState';
import { getTimeItem } from '@Query/base/timeItems';
import { addTimeItem } from './addTimeItem';
import { isISODateString } from '@Tools/dateTime';
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
 *
 * `embargo` (ISO instant) announces on a date: the publish is recorded now and readers withhold the
 * tournament until the embargo lifts. The roll-up stays INTENT — `published` is true the moment this is
 * called — and the clock is applied at READ time by `getTournamentVisibleFrom`, so nothing has to run at
 * midnight to make the tournament appear. An embargo already in the past is simply not an embargo.
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
  embargo?: string;
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
  embargo,
}: SetTournamentInfoPublishStateArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  // A malformed embargo is rejected rather than ignored: silently dropping it would publish
  // IMMEDIATELY something the director asked to withhold until a date.
  if (embargo !== undefined && !isISODateString(embargo)) {
    return { error: INVALID_VALUES, context: { embargo } };
  }

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
  // Likewise the embargo: absent means visible as soon as this is published.
  if (embargo !== undefined) info.embargo = embargo;
  itemValue[status].info = info;

  addTimeItem({
    timeItem: { itemValue, itemType },
    element: tournamentRecord,
    removePriorValues,
  });

  return { ...SUCCESS };
}
