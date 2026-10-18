import { addNotice } from '@Global/state/globalState';

// constants and types
import { Tournament, Venue } from '@Types/tournamentTypes';
import { MODIFY_VENUE } from '@Constants/topicConstants';

/** Dispatch MODIFY_VENUE for one venue, keyed by venueId so a venue touched twice in a cycle is sent once. */
export function modifyVenueNotice({ tournamentId, venue }: { tournamentId?: string; venue?: Venue }) {
  if (!venue?.venueId) return;
  addNotice({
    payload: { venue, tournamentId },
    topic: MODIFY_VENUE,
    key: venue.venueId,
  });
}

// `updatedAt` is a stamp, not venue data: a write that only restamps it has changed nothing
const venueFingerprint = (venue: Venue) =>
  JSON.stringify(venue, (key, value) => (key === 'updatedAt' ? undefined : value));

/**
 * The state of every venue in a record, for `modifiedVenueNotices` to compare against after a write.
 * For writers that walk venues and courts (enable/disable, court availability) where whether a given
 * venue actually changed is easiest to learn by looking.
 */
export function venueSnapshot(tournamentRecord?: Tournament): Map<string, string> {
  const snapshot = new Map<string, string>();
  for (const venue of tournamentRecord?.venues ?? []) {
    if (venue?.venueId) snapshot.set(venue.venueId, venueFingerprint(venue));
  }
  return snapshot;
}

/** MODIFY_VENUE for each venue that differs from its `venueSnapshot`; a venue that did not change is not announced. */
export function modifiedVenueNotices({
  tournamentRecord,
  snapshot,
}: {
  snapshot: Map<string, string>;
  tournamentRecord?: Tournament;
}) {
  for (const venue of tournamentRecord?.venues ?? []) {
    if (!venue?.venueId || !snapshot.has(venue.venueId)) continue;
    if (snapshot.get(venue.venueId) !== venueFingerprint(venue)) {
      modifyVenueNotice({ tournamentId: tournamentRecord?.tournamentId, venue });
    }
  }
}
