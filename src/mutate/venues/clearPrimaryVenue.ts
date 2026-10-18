import { Tournament, Venue } from '@Types/tournamentTypes';

/**
 * Clear `isPrimary` from every venue but `exceptVenueId`. Returns the venues it changed, so the
 * caller can announce them: they are venues the caller did not ask to modify.
 */
export function clearPrimaryVenue({
  tournamentRecord,
  exceptVenueId,
}: {
  tournamentRecord: Tournament;
  exceptVenueId?: string;
}): Venue[] {
  const cleared: Venue[] = [];
  for (const venue of tournamentRecord.venues ?? []) {
    if (venue.isPrimary && venue.venueId !== exceptVenueId) {
      delete venue.isPrimary;
      cleared.push(venue);
    }
  }
  return cleared;
}
