import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { findVenue } from '@Query/venues/findVenue';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { getCourtInfo } from './getCourtInfo';

// constants and types
import { ErrorType, MISSING_VENUE_ID } from '@Constants/errorConditionConstants';
import { ERROR, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';

// The only difference from finding a venue is that information is filtered from both venue and courts
// e.g. dataAvailability objects are not returned.

type GetVenueDataArgs = {
  tournamentRecord: Tournament;
  venueId: string;
};
export function getVenueData(params: GetVenueDataArgs): {
  success?: boolean;
  error?: ErrorType;
  venueData?: any;
} {
  const paramsCheck = checkRequiredParameters(params, [
    { [TOURNAMENT_RECORD]: true },
    { venueId: true, [ERROR]: MISSING_VENUE_ID },
  ]);
  if (paramsCheck.error) return paramsCheck;

  const { tournamentRecord, venueId } = params;

  const result = findVenue({ tournamentRecord, venueId });
  if (result.error) return result;

  const courts = result.venue?.courts ?? [];
  const courtsInfo = courts.map((court) =>
    (({ courtInfo }) => ({
      ...courtInfo,
    }))(
      getCourtInfo({
        courtId: court.courtId,
        internalUse: true,
        tournamentRecord,
      }),
    ),
  );

  const venueInfo =
    result.venue &&
    (({ venueId, venueName, venueAbbreviation }) => ({
      venueAbbreviation,
      venueName,
      venueId,
    }))(result.venue);

  const venueData = venueInfo && { ...venueInfo, courtsInfo };

  return { ...SUCCESS, venueData: makeDeepCopy(venueData, false, true) };
}
