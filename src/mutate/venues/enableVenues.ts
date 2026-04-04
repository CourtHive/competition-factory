import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { removeExtension } from '../extensions/removeExtension';

// constants and types
import { TOURNAMENT_RECORDS, VENUE_IDS } from '@Constants/attributeConstants';
import { DISABLED } from '@Constants/extensionConstants';
import { TournamentRecords } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';

type EnableVenuesArgs = {
  tournamentRecords: TournamentRecords;
  enableAll?: boolean;
  venueIds: string[];
};

export function enableVenues(params: EnableVenuesArgs) {
  const tournamentRecords = resolveTournamentRecords(params);
  const paramsToCheck: any[] = [{ [TOURNAMENT_RECORDS]: true }];
  !params.enableAll && paramsToCheck.push({ [VENUE_IDS]: true });
  const paramCheck = checkRequiredParameters(params, paramsToCheck);
  if (paramCheck.error) return paramCheck;

  const { venueIds, enableAll } = params;
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    for (const venue of tournamentRecord.venues ?? []) {
      if (enableAll || venueIds?.includes(venue.venueId)) removeExtension({ element: venue, name: DISABLED });
    }
  }

  return { ...SUCCESS };
}
