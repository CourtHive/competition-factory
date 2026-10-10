import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import type { FlightProfile, HydratedFlightProfile } from '@Types/factoryTypes';
import { ErrorType, MISSING_EVENT } from '@Constants/errorConditionConstants';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { Event } from '@Types/tournamentTypes';

type GetFlightProfileArgs = {
  eventId?: string;
  event: Event;
};
/**
 * The event's flight profile. A flight profile lives on the EVENT only (`event.flightProfile`, or the `flightProfile`
 * extension on older records); a draw's flight is the entry whose `drawId` matches it.
 *
 * Called directly it returns the STORED object (`FlightProfile`). Called through an engine (`eventId` present) it returns
 * a deep copy whose flights carry the draw generated for each (`HydratedFlightProfile`).
 */
export function getFlightProfile({ event, eventId }: GetFlightProfileArgs): {
  flightProfile?: HydratedFlightProfile;
  error?: ErrorType;
} {
  if (!event) return { error: MISSING_EVENT };

  const stored: FlightProfile | undefined = firstClassOrExtension({
    element: event,
    attribute: 'flightProfile',
    name: FLIGHT_PROFILE,
  });

  // eventId indicates that `getFlightProfile()` has been called via `tournamentEngine`
  // a deep copy is made and drawDefinitions are attached for client convenience
  const flightProfile = eventId ? makeDeepCopy(stored, false, true) : stored;

  if (eventId) {
    event.drawDefinitions?.forEach((drawDefinition) => {
      flightProfile?.flights?.forEach((flight) => {
        if (flight.drawId === drawDefinition.drawId) {
          Object.assign(flight, { drawDefinition });
        }
      });
    });
  }

  return { flightProfile };
}
