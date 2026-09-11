import { addDrawNotice, addMatchUpsNotice } from '../notifications/drawNotifications';
import tieFormatDefaults from '@Assemblies/generators/templates/tieFormatDefaults';
import { checkTieFormat } from '@Mutate/tieFormat/checkTieFormat';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { addEventNotice } from '@Mutate/notifications/eventNotifications';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { requireParams } from '@Helpers/parameters/requireParams';
import { normalizeDiscipline } from '@Helpers/coercedDiscipline';
import { definedAttributes } from '@Tools/definedAttributes';
import { normalizeGender } from '@Helpers/coercedGender';
import { getTopics } from '@Global/state/globalState';
import { UUID } from '@Tools/UUID';

// Constants and types
import { EVENT_EXISTS, ErrorType, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, EVENT as EVENT_ATTR } from '@Constants/attributeConstants';
import { SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { Event, Tournament } from '@Types/tournamentTypes';
import { tieFormats } from '@Fixtures/scoring/tieFormats';
import { ADD_MATCHUPS } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';

type AddEventArgs = {
  suppressNotifications?: boolean;
  tournamentRecord: Tournament;
  internalUse?: boolean;
  event: any; // any because eventId need not be present
};
export function addEvent({ suppressNotifications, tournamentRecord, internalUse, event }: AddEventArgs): {
  context?: { [key: string]: any };
  error?: ErrorType;
  event?: Event;
  info?: any;
} {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT_ATTR]);
  if (paramsCheck.error) return paramsCheck;
  tournamentRecord.events ??= [];

  // set default startDate, endDate based on tournamentRecord
  const { startDate, endDate } = tournamentRecord;

  // if not internal use disallow passing entries and drawDefinitions
  if (!internalUse && (event.entries?.length || event.drawDefinitions?.length)) {
    const context = definedAttributes({
      drawDefinitions: !!event.drawDefinitions?.length,
      entries: !!event.entries?.length,
    });
    return {
      info: 'entries/drawDefinitions cannot exist',
      error: INVALID_VALUES,
      context,
    };
  }

  const eventRecord = {
    eventType: SINGLES_EVENT,
    drawDefinitions: [],
    entries: [],
    startDate,
    endDate,
    ...event,
  };

  // normalize accepted TODS short codes (M/F/X/A) to the canonical extended form
  // so events are stored with a canonical gender at rest
  if (eventRecord.gender) eventRecord.gender = normalizeGender(eventRecord.gender);

  // discipline is an open vocabulary — normalize casing/separators on write so
  // 'beach volleyball' and 'BEACH_VOLLEYBALL' are stored identically
  if (eventRecord.discipline) eventRecord.discipline = normalizeDiscipline(eventRecord.discipline);

  if (event.eventType === TEAM_EVENT) {
    if (event.tieFormat) {
      // A supplied tieFormat may carry no collectionIds — the published `fixtures.tieFormats` cannot
      // hold them, since a collectionId identifies a collection INSTANCE within a record and a shared
      // fixture would hand every record the same identities. Mint them here so the stored tieFormat is
      // usable: without ids the generated lines all carry `collectionId: null`, cannot be attributed to
      // their collection, and the tie never scores.
      //
      // On a COPY: `eventRecord` is a shallow spread of `event`, so mutating `event.tieFormat` in place
      // would stamp ids onto the caller's object — and onto the shared fixture when that is what was
      // passed.
      const result = checkTieFormat({ tieFormat: makeDeepCopy(event.tieFormat, false, true) });
      if (result.error) return result;
      eventRecord.tieFormat = result.tieFormat;
    } else if (event.tieFormatName) {
      if (!tieFormats[event.tieFormatName]) {
        return {
          context: { tieFormatName: event.tieFormatName },
          error: INVALID_VALUES,
        };
      }
      const tieFormat = tieFormatDefaults({
        isMock: tournamentRecord?.isMock,
        namedFormat: event.tieFormatName,
        event,
      });
      eventRecord.tieFormat = tieFormat;
    }
  }

  eventRecord.eventId ??= UUID();

  const eventExists = tournamentRecord.events.reduce((exists: any, event) => {
    return exists || event.eventId === eventRecord.eventId;
  }, undefined);

  if (eventExists) {
    return { error: EVENT_EXISTS };
  }

  const newEvent = eventRecord as Event;
  tournamentRecord.events.push(newEvent);

  if (!suppressNotifications) {
    const { topics } = getTopics();
    if (topics.includes(ADD_MATCHUPS)) {
      const matchUps = allEventMatchUps({ event }).matchUps ?? [];
      addMatchUpsNotice({
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event.eventId,
        matchUps,
      });
    }

    const { drawDefinitions, ...rest } = event;

    for (const drawDefinition of drawDefinitions ?? []) {
      addDrawNotice({ drawDefinition });
    }

    addEventNotice({ tournamentId: tournamentRecord?.tournamentId, event: rest });
  }

  return { ...SUCCESS, event: eventRecord };
}
