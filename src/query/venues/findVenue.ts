import { getLinkedTournamentIds } from '@Query/tournaments/getLinkedTournamentIds';
import { requireParams } from '@Helpers/parameters/requireParams';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { ErrorType, VENUE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, VENUE_ID } from '@Constants/attributeConstants';
import { Tournament, Venue } from '@Types/tournamentTypes';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

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
  const paramsCheck = requireParams({ tournamentRecord, venueId }, [TOURNAMENT_RECORD, VENUE_ID]);
  if (paramsCheck.error) return paramsCheck;

  const venues = tournamentRecord!.venues ?? [];
  const venue = venues.reduce((venue: any, venueRecord) => {
    return venueRecord.venueId === venueId ? venueRecord : venue;
  }, undefined);

  if (!venue && tournamentRecords) {
    const linkedTournamentIds =
      getLinkedTournamentIds({
        tournamentRecords,
      }).linkedTournamentIds ?? [];

    const relevantIds = linkedTournamentIds[tournamentRecord!.tournamentId];

    // if there are linked tournaments search for the venue in all linked tournaments. A QUERY: it used to add a
    // copy of what it found to tournamentRecord (with an ADD_VENUE notice); the one caller that needs the copy,
    // assignMatchUpVenue, now adds it itself (P54)
    for (const tournamentId of relevantIds) {
      const record = tournamentRecords[tournamentId];
      const result = findVenue({ tournamentRecord: record, venueId });
      if (result.success && result.venue) return { ...SUCCESS, venue: result.venue };
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
