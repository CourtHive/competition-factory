import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { addNotice } from '@Global/state/globalState';
import { extractDate, isValidEmbargoDate } from '@Tools/dateTime';
import { getTimeItem } from '@Query/base/timeItems';
import { addTimeItem } from './addTimeItem';

// constants
import { PUBLIC, PUBLISH, STATUS } from '@Constants/timeItemConstants';
import { PUBLISH_ORDER_OF_PLAY } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_EMBARGO,
  INVALID_VALUES,
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

/**
 * `dateEmbargoes` releases each scheduled date on its own clock: `{ 'YYYY-MM-DD': ISO instant }`. A date whose embargo
 * has not lifted is withheld from the published schedule while the other dates stay visible; the whole-schedule
 * `embargo` still withholds every date. A date published without an entry is visible as soon as it is published.
 *
 * Unlike `scheduledDates` and `embargo`, which every call restates, an OMITTED `dateEmbargoes` keeps the prior map. A
 * call that only adds or removes a date must not release another date's pending embargo as a side effect, because
 * releasing early is the one mistake an embargo cannot take back. Pass `null` or `{}` to clear every date's embargo.
 */
function validDateEmbargoes(dateEmbargoes) {
  if (dateEmbargoes === undefined || dateEmbargoes === null) return undefined;
  if (typeof dateEmbargoes !== 'object' || Array.isArray(dateEmbargoes)) {
    return { error: INVALID_VALUES, context: { dateEmbargoes } };
  }
  for (const [date, embargo] of Object.entries(dateEmbargoes)) {
    // the key is matched against matchUp.schedule.scheduledDate, so only the canonical calendar day is accepted
    if (extractDate(date) !== date) return { error: INVALID_VALUES, context: { dateEmbargoes, date } };
    if (!isValidEmbargoDate(embargo)) return { error: INVALID_EMBARGO, context: { date, embargo } };
  }
  return undefined;
}

function publishOOP({
  dateEmbargoes,
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
  const invalid = validDateEmbargoes(dateEmbargoes);
  if (invalid) return invalid;
  const priorDateEmbargoes = itemValue[status]?.orderOfPlay?.dateEmbargoes;
  const orderOfPlay: any = { published: true };
  // Only set scheduledDates/eventIds when explicitly provided;
  // omitting them means "all dates/events" (no filtering).
  if (scheduledDates !== undefined) orderOfPlay.scheduledDates = scheduledDates;
  if (eventIds !== undefined) orderOfPlay.eventIds = eventIds;
  if (embargo && !isValidEmbargoDate(embargo)) return { error: INVALID_EMBARGO };
  if (embargo) orderOfPlay.embargo = embargo;
  const nextDateEmbargoes = dateEmbargoes === undefined ? priorDateEmbargoes : dateEmbargoes;
  if (nextDateEmbargoes && Object.keys(nextDateEmbargoes).length) orderOfPlay.dateEmbargoes = { ...nextDateEmbargoes };
  // a record already published under another status holds no entry for this one yet
  itemValue[status] ??= {};
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
      dateEmbargoes: orderOfPlay.dateEmbargoes,
      eventIds,
    },
  });

  return { ...SUCCESS };
}
