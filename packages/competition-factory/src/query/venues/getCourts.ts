import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import type { Tournament } from '@Types/tournamentTypes';

type GetCourtsArgs = {
  tournamentRecord?: Tournament;
  venueId?: string;
  venueIds?: string[];
};
/**
 *
 * @param {string} venueId - optional -
 * @param {string[]} venueIds - optional -
 */
export function getCourts({ tournamentRecord, venueId, venueIds }: GetCourtsArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const courts = (tournamentRecord.venues ?? [])
    .filter((venue) => {
      if (venueId) return venue.venueId === venueId;
      if (venueIds) return venueIds.includes(venue.venueId);
      return true;
    })
    .map((venue) => {
      const { venueId } = venue;
      const venueCourts = makeDeepCopy(venue.courts ?? []);
      venueCourts.forEach((court) => Object.assign(court, { venueId }));
      return venueCourts;
    })
    .flat();

  return { courts };
}
