import { setFirstClassOrExtension } from '../extensions/setFirstClassOrExtension';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';

// constants
import { TOURNAMENT_RECORDS, VENUE_IDS } from '@Constants/attributeConstants';
import { DISABLED } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type DisableVenuesArgs = {
  tournamentRecords: any;
  tournamentId?: string;
  venueIds: string[];
};

export function disableVenues(params: DisableVenuesArgs) {
  const { tournamentRecords, tournamentId, venueIds } = params;
  const paramsToCheck: any[] = [{ [TOURNAMENT_RECORDS]: true, [VENUE_IDS]: true }];
  const paramCheck = checkRequiredParameters(params, paramsToCheck);
  if (paramCheck.error) return paramCheck;

  const tournamentIds = Object.keys(tournamentRecords).filter((id) => !tournamentId || id === tournamentId);

  for (const tournamentId of tournamentIds) {
    const tournamentRecord = tournamentRecords[tournamentId];
    venuesDisable({ tournamentRecord, venueIds });
  }

  return { ...SUCCESS };
}

function venuesDisable({ tournamentRecord, venueIds }) {
  for (const venue of tournamentRecord.venues ?? []) {
    if (venueIds?.includes(venue.venueId)) {
      const result = setFirstClassOrExtension({
        element: venue,
        attribute: 'disabled',
        name: DISABLED,
        value: true,
        creationTime: false,
      });
      if (result.error) return result;
    }
  }

  return { ...SUCCESS };
}
