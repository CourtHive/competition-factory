import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { validDateAvailability } from '@Validators/validateDateAvailability';
import { requireParams } from '@Helpers/parameters/requireParams';
import { definedAttributes } from '@Tools/definedAttributes';
import { addExtension } from '../extensions/addExtension';
import { clearPrimaryVenue } from './clearPrimaryVenue';
import { addNotice } from '@Global/state/globalState';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { validTimePeriod } from '@Validators/time';
import { UUID } from '@Tools/UUID';

// constants and types
import { ErrorType, MISSING_VALUE, VENUE_EXISTS, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { CONTEXT } from '@Constants/extensionConstants';
import { ADD_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Venue } from '@Types/tournamentTypes';

export function addVenue(params) {
  const { disableNotice, venue, context } = params;
  if (typeof venue !== 'object') return { error: INVALID_VALUES };
  const tournamentRecords = resolveTournamentRecords(params);
  venue.venueId ??= UUID();

  let addedVenue;

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = venueAdd({
      disableNotice: true,
      tournamentRecord,
      context,
      venue,
    });
    if (result?.error) return result;
    addedVenue = result.venue;
  }

  if (!disableNotice) {
    addNotice({ topic: ADD_VENUE, payload: { venue } });
  }

  return definedAttributes({ ...SUCCESS, venue: addedVenue });
}

type AddVenueArgs = {
  context?: { [key: string]: any };
  disableNotice?: boolean;
  tournamentRecord: any;
  venue: Venue;
};

function venueAdd({ tournamentRecord, disableNotice, context, venue }: AddVenueArgs): {
  success?: boolean;
  error?: ErrorType;
  venue?: Venue;
  info?: string;
} {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!venue) return { error: MISSING_VALUE, info: 'missing venue' };

  tournamentRecord.venues ??= [];
  venue.venueId ??= UUID();

  const venueExists = tournamentRecord.venues.reduce((exists: any, existingVenue) => {
    return exists || existingVenue.venueId === venue.venueId;
  }, undefined);

  if (venueExists) {
    return { error: VENUE_EXISTS };
  }

  if (venue.dateAvailability?.length) {
    const result = validDateAvailability({ dateAvailability: venue.dateAvailability });
    if (result.error) return result;
  }

  if (venue.defaultStartTime || venue.defaultEndTime) {
    if (!venue.defaultStartTime || !venue.defaultEndTime) {
      return { error: INVALID_VALUES, info: 'both defaultStartTime and defaultEndTime are required' };
    }
    if (!validTimePeriod({ startTime: venue.defaultStartTime, endTime: venue.defaultEndTime })) {
      return { error: INVALID_VALUES, info: 'defaultEndTime must be after defaultStartTime' };
    }
  }

  if (context) {
    const extension = {
      value: context,
      name: CONTEXT,
    };
    addExtension({ element: venue, extension });
  }

  if (venue.isPrimary) {
    clearPrimaryVenue({ tournamentRecord });
  }

  tournamentRecord.venues.push(venue);

  if (!disableNotice) {
    addNotice({
      payload: { venue, tournamentId: tournamentRecord.tournamentId },
      topic: ADD_VENUE,
    });
  }

  return { ...SUCCESS, venue: makeDeepCopy(venue) };
}
