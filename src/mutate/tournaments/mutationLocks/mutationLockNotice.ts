import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { modifyVenueNotice } from '@Mutate/venues/venueNotices';

// types
import { DrawDefinition, Event, Extension, Tournament, Venue } from '@Types/tournamentTypes';

type MutationLockNoticeArgs = {
  drawDefinition?: { drawId: string; extensions?: Extension[] };
  event?: { eventId: string; extensions?: Extension[] };
  tournamentRecord: Tournament;
  venue?: Venue;
};

/**
 * A lock is stored as an extension on the element it locks, so adding or removing one modifies that
 * element: announce it on the element's own topic. A tournament-level lock (and the tournament-level
 * feature gate) lives in the root extensions, which no tournament notice describes; it is not announced.
 */
export function mutationLockNotice({ tournamentRecord, drawDefinition, event, venue }: MutationLockNoticeArgs) {
  const tournamentId = tournamentRecord.tournamentId;
  if (drawDefinition) {
    modifyDrawNotice({ drawDefinition: drawDefinition as DrawDefinition, eventId: event?.eventId, tournamentId });
  } else if (event) {
    modifyEventNotice({ event: event as Event, tournamentId });
  } else if (venue) {
    modifyVenueNotice({ tournamentId, venue });
  }
}
