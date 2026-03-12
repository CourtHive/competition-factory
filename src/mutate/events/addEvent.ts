import { addDrawNotice, addMatchUpsNotice } from '../notifications/drawNotifications';
import tieFormatDefaults from '@Assemblies/generators/templates/tieFormatDefaults';
import { addEventNotice } from '@Mutate/notifications/eventNotifications';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { validateTieFormat } from '@Validators/validateTieFormat';
import { definedAttributes } from '@Tools/definedAttributes';
import { getTopics } from '@Global/state/globalState';
import { UUID } from '@Tools/UUID';

// Constants and types
import { SINGLES_EVENT, TEAM_EVENT } from '@Constants/eventConstants';
import { Event, Tournament } from '@Types/tournamentTypes';
import { ADD_MATCHUPS } from '@Constants/topicConstants';
import { tieFormats } from '@Fixtures/scoring/tieFormats';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EVENT_EXISTS,
  ErrorType,
  INVALID_VALUES,
  MISSING_EVENT,
  MISSING_TOURNAMENT_RECORD,
} from '@Constants/errorConditionConstants';

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
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  tournamentRecord.events ??= [];
  if (!event) return { error: MISSING_EVENT };

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

  if (event.eventType === TEAM_EVENT) {
    if (event.tieFormat) {
      const result = validateTieFormat({ tieFormat: event.tieFormat });
      if (result.error) return result;
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

  if (!eventRecord.eventId) eventRecord.eventId = UUID();

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

    for (const drawDefinition of drawDefinitions || []) {
      addDrawNotice({ drawDefinition });
    }

    addEventNotice({ tournamentId: tournamentRecord?.tournamentId, event: rest });
  }

  return { ...SUCCESS, event: eventRecord };
}
