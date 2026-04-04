import { makeDeepCopy } from '@Tools/makeDeepCopy';

import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';

/**
 *
 * @param {string} venueId - optional -
 * @param {string[]} venueIds - optional -
 */
export function getCourts({ tournamentRecord, venueId, venueIds }) {
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
