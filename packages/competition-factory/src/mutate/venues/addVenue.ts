import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { validDateAvailability } from '@Validators/validateDateAvailability';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addExtension } from '@Mutate/extensions/addExtension';
import { definedAttributes } from '@Tools/definedAttributes';
import { clearPrimaryVenue } from './clearPrimaryVenue';
import { canonicalTime } from '@Tools/canonicalClock';
import { addNotice } from '@Global/state/globalState';
import { modifyVenueNotice } from './venueNotices';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { validTimePeriod } from '@Validators/time';
import { UUID } from '@Tools/UUID';

// constants and types
import { ErrorType, MISSING_VALUE, VENUE_EXISTS, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { Tournament, Venue } from '@Types/tournamentTypes';
import { CONTEXT } from '@Constants/extensionConstants';
import { ADD_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import type { ResultType } from '@Types/factoryTypes';

export function addVenue(params): ResultType & { venue?: Venue } {
  const { disableNotice, venue, context } = params;
  if (typeof venue !== 'object') return { error: INVALID_VALUES };
  const tournamentRecords = resolveTournamentRecords(params);
  // the id is minted onto a copy: the caller's object is not written
  const venueId = venue.venueId ?? UUID();

  let addedVenue;

  for (const tournamentRecord of Object.values(tournamentRecords)) {
    const result = venueAdd({
      disableNotice: true,
      venue: { ...venue, venueId },
      tournamentRecord,
      context,
    });
    if (result?.error) return result;
    addedVenue = result.venue;
    // a venue added as primary takes the flag from the venue that held it, which is modified too
    if (!disableNotice) {
      for (const cleared of result.clearedPrimaryVenues ?? []) {
        modifyVenueNotice({ tournamentId: tournamentRecord.tournamentId, venue: cleared });
      }
    }
  }

  if (!disableNotice) {
    addNotice({ topic: ADD_VENUE, payload: { venue: addedVenue } });
  }

  return definedAttributes({ ...SUCCESS, venue: addedVenue });
}

type AddVenueArgs = {
  context?: { [key: string]: any };
  disableNotice?: boolean;
  tournamentRecord: Tournament;
  venue: Venue;
};

function venueAdd({ tournamentRecord, disableNotice, context, venue }: AddVenueArgs): {
  success?: boolean;
  clearedPrimaryVenues?: Venue[];
  error?: ErrorType;
  venue?: Venue;
  info?: unknown;
} {
  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!venue) return { error: MISSING_VALUE, info: 'missing venue' };

  const prepared = prepareVenue({ tournamentRecord, context, venue });
  if (prepared.error || !prepared.venue) return prepared;
  venue = prepared.venue;

  const clearedPrimaryVenues = venue.isPrimary ? clearPrimaryVenue({ tournamentRecord }) : [];

  tournamentRecord.venues ??= [];
  tournamentRecord.venues.push(venue);

  if (!disableNotice) {
    addNotice({
      payload: { venue, tournamentId: tournamentRecord.tournamentId },
      topic: ADD_VENUE,
    });
  }

  return { ...SUCCESS, venue: makeDeepCopy(venue), clearedPrimaryVenues };
}

/**
 * The venue a record would store, without storing it: a copy with its id, refused when the record already holds the id
 * or its availability or default times are not valid, with availability and times canonical.
 */
function prepareVenue({
  tournamentRecord,
  context,
  venue: given,
}: {
  context?: AddVenueArgs['context'];
  tournamentRecord: Tournament;
  venue: Venue;
}): { error?: ErrorType; info?: string; venue?: Venue } {
  // each record stores its own copy, so neither the caller's object nor another record's venue is written; `venues`
  // is created only when a venue is stored (a refusal writes nothing)
  const venue = makeDeepCopy({ ...given, venueId: given.venueId ?? UUID() }, false, true);

  const venueExists = (tournamentRecord.venues ?? []).some((existingVenue) => existingVenue.venueId === venue.venueId);
  if (venueExists) {
    return { error: VENUE_EXISTS };
  }

  if (venue.dateAvailability?.length) {
    const result = validDateAvailability({ dateAvailability: venue.dateAvailability });
    if (result.error) return result;
    venue.dateAvailability = result.canonicalAvailability;
  }

  if (venue.defaultStartTime || venue.defaultEndTime) {
    if (!venue.defaultStartTime || !venue.defaultEndTime) {
      return { error: INVALID_VALUES, info: 'both defaultStartTime and defaultEndTime are required' };
    }
    if (!validTimePeriod({ startTime: venue.defaultStartTime, endTime: venue.defaultEndTime })) {
      return { error: INVALID_VALUES, info: 'defaultEndTime must be after defaultStartTime' };
    }
    venue.defaultStartTime = canonicalTime(venue.defaultStartTime);
    venue.defaultEndTime = canonicalTime(venue.defaultEndTime);
  }

  if (context) {
    const extension = {
      value: context,
      name: CONTEXT,
    };
    addExtension({ element: venue, extension });
  }

  return { venue };
}

/**
 * A schedule plan's copy of a venue only a linked record holds (assignMatchUpVenue): prepared and validated now, the
 * commit stores it, taking the primary flag as an added venue does. Nothing is announced, as nothing was when the
 * schedule writer copied it. Undefined when the copy is refused; the assignment goes ahead without it, as before.
 */
export function planVenueCopy({ tournamentRecord, venue }: { tournamentRecord: Tournament; venue: Venue }) {
  const prepared = prepareVenue({ tournamentRecord, venue });
  if (prepared.error || !prepared.venue) return undefined;
  const copy = prepared.venue;
  return () => {
    if (copy.isPrimary) clearPrimaryVenue({ tournamentRecord });
    tournamentRecord.venues ??= [];
    tournamentRecord.venues.push(copy);
  };
}
