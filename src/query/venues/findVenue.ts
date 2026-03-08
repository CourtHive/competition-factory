import { getLinkedTournamentIds } from '@Query/tournaments/getLinkedTournamentIds';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { addVenue } from '../../mutate/venues/addVenue';

// constants and types
import { Tournament, Venue } from '@Types/tournamentTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VENUE_ID,
  VENUE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type FindVenueArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  venueId: string;
};

export function findVenue({ tournamentRecords, tournamentRecord, venueId }: FindVenueArgs): {
  success?: boolean;
  venue?: Venue;
  error?: ErrorType;
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!venueId) return { error: MISSING_VENUE_ID };

  const venues = tournamentRecord.venues ?? [];
  const venue = venues.reduce((venue: any, venueRecord) => {
    return venueRecord.venueId === venueId ? venueRecord : venue;
  }, undefined);

  if (!venue && tournamentRecords) {
    const linkedTournamentIds =
      getLinkedTournamentIds({
        tournamentRecords,
      }).linkedTournamentIds ?? [];

    const relevantIds = linkedTournamentIds[tournamentRecord.tournamentId];

    // if there are linked tournaments search for court in all linked tournaments
    for (const tournamentId of relevantIds) {
      const record = tournamentRecords[tournamentId];
      const result = findVenue({ tournamentRecord: record, venueId });
      // if venue is found in linked tournamentRecords, add venue to original tournamentRecord
      if (result.success && result.venue) {
        addVenue({ tournamentRecord, venue: result.venue });
        return { ...SUCCESS, venue };
      }
    }
  }

  if (venue) {
    return { ...SUCCESS, venue };
  }

  return { error: VENUE_NOT_FOUND };
}

export function publicFindVenue({ convertExtensions, ...params }) {
  const { tournamentRecords, tournamentRecord, venueId } = params;
  const result = findVenue({ tournamentRecords, tournamentRecord, venueId });
  return makeDeepCopy(result, convertExtensions, true);
}
