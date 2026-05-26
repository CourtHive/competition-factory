import { getDisabledStatus } from '@Query/extensions/getDisabledStatus';
import { getInContextCourt } from './getInContextCourt';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
import { HydratedCourt, HydratedVenue } from '@Types/hydrated';
import { Tournament, Venue } from '@Types/tournamentTypes';
import { DISABLED } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type GetVenuesAndCourtsArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  convertExtensions?: boolean;
  ignoreDisabled?: boolean;
  tournamentId?: string;
  venueIds?: string[];
  dates?: string[];
};
function shouldIncludeVenue(venue: Venue, venueIds: string[], ignoreDisabled: boolean): boolean {
  if (venueIds.length && !venueIds.includes(venue.venueId)) return false;
  if (ignoreDisabled) {
    const disabledValue = firstClassOrExtension({ element: venue, attribute: 'disabled', name: DISABLED });
    if (disabledValue) return false;
  }
  return true;
}

function processVenue({
  venue,
  convertExtensions,
  ignoreDisabled,
  dates,
  uniqueVenueIds,
  venues,
  uniqueCourtIds,
  courts,
}: {
  venue: Venue;
  convertExtensions: boolean | undefined;
  ignoreDisabled: boolean | undefined;
  dates: string[] | undefined;
  uniqueVenueIds: string[];
  venues: HydratedVenue[];
  uniqueCourtIds: string[];
  courts: HydratedCourt[];
}) {
  if (!uniqueVenueIds.includes(venue.venueId)) {
    venues.push(makeDeepCopy(venue, convertExtensions, true));
    uniqueVenueIds.push(venue.venueId);
  }
  for (const court of venue.courts ?? []) {
    if (!uniqueCourtIds.includes(court.courtId)) {
      if (ignoreDisabled) {
        const disabledValue = firstClassOrExtension({ element: court, attribute: 'disabled', name: DISABLED });
        const isDisabled = getDisabledStatus({ disabledValue, dates });
        if (isDisabled) continue;
      }
      const { inContextCourt } = getInContextCourt({
        convertExtensions,
        ignoreDisabled,
        venue,
        court,
      });

      courts.push(inContextCourt);
      uniqueCourtIds.push(court.courtId);
    }
  }
}

export function getVenuesAndCourts(params: GetVenuesAndCourtsArgs): ResultType & {
  venues?: HydratedVenue[];
  courts?: HydratedCourt[];
} {
  const {
    convertExtensions,
    ignoreDisabled,
    venueIds = [],
    dates, // used in conjunction with ignoreDisabled
  } = params;

  const tournamentRecords =
    params.tournamentRecords ||
    (params.tournamentRecord && {
      [params.tournamentRecord.tournamentId]: params.tournamentRecord,
    }) ||
    {};

  const uniqueVenueIds: string[] = [];
  const uniqueCourtIds: string[] = [];
  const courts: HydratedCourt[] = [];
  const venues: HydratedVenue[] = [];

  const tournamentIds = Object.keys(tournamentRecords).filter(
    (id) => !params.tournamentId || id === params.tournamentId,
  );
  tournamentIds.forEach((tournamentId) => {
    const tournamentRecord = tournamentRecords[tournamentId];
    for (const venue of tournamentRecord.venues ?? []) {
      if (!shouldIncludeVenue(venue, venueIds, !!ignoreDisabled)) continue;
      processVenue({
        venue,
        convertExtensions,
        ignoreDisabled,
        dates,
        uniqueVenueIds,
        venues,
        uniqueCourtIds,
        courts,
      });
    }
  });

  return { courts, venues, ...SUCCESS };
}

export function getTournamentVenuesAndCourts({
  convertExtensions,
  tournamentRecord,
  ignoreDisabled,
  dates, // used in conjunction with ignoreDisabled
}: GetVenuesAndCourtsArgs): ResultType & {
  venues?: HydratedVenue[];
  courts?: HydratedCourt[];
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORDS };

  const venues = makeDeepCopy(tournamentRecord.venues ?? [], convertExtensions)
    .filter((venue) => {
      if (!ignoreDisabled) return venue;
      const disabledValue = firstClassOrExtension({ element: venue, attribute: 'disabled', name: DISABLED });
      return !disabledValue && venue;
    })
    .filter(Boolean);

  const courts = venues.reduce((courts, venue) => {
    const additionalCourts = (venue?.courts ?? [])
      .filter((court) => {
        if (!ignoreDisabled && !dates?.length) return court;
        const disabledValue = firstClassOrExtension({ element: court, attribute: 'disabled', name: DISABLED });
        return getDisabledStatus({ disabledValue, dates });
      })
      .filter(Boolean)
      .map((court) => {
        const { inContextCourt } = getInContextCourt({
          convertExtensions,
          ignoreDisabled,
          venue,
          court,
        });

        return inContextCourt;
      });

    return additionalCourts.length ? courts.concat(additionalCourts) : courts;
  }, []);

  return { venues, courts };
}

type Accumulator = {
  venueIds: string[];
  venues: Venue[];
};

type GetCompeitionVenuesArgs = {
  tournamentRecords: TournamentRecords;
  requireCourts?: boolean;
  dates?: string[];
};

export function getCompetitionVenues({ tournamentRecords, requireCourts, dates }: GetCompeitionVenuesArgs): {
  venueIds?: string[];
  error?: ErrorType;
  venues?: Venue[];
} {
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  const tournamentIds = Object.keys(tournamentRecords);
  return tournamentIds.reduce(
    (accumulator: Accumulator, tournamentId) => {
      const tournamentRecord = tournamentRecords[tournamentId];
      const { venues } = getTournamentVenuesAndCourts({
        tournamentRecord,
        dates,
      });
      venues?.forEach((venue) => {
        const { venueId, courts } = venue;
        const includeVenue = !requireCourts || courts?.length;
        if (includeVenue && !accumulator.venueIds.includes(venueId)) {
          accumulator.venues.push(venue);
          accumulator.venueIds.push(venueId);
        }
      });
      return accumulator;
    },
    { venues: [], venueIds: [] },
  );
}
