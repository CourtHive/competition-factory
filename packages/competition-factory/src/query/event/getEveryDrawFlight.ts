import { getFlightProfile } from '@Query/event/getFlightProfile';
import { ensureInt } from '@Tools/ensureInt';

// types
import { Event } from '@Types/tournamentTypes';
import { Flight } from '@Types/factoryTypes';

/**
 * The event's flights with every draw counted as a flight: the stored flights, then a `manuallyAdded` flight for each
 * draw that has none (a record stored without a profile, e.g. one ingested or written before draws were always given
 * a flight). Synthesized flights are numbered after the highest stored flight number. Nothing is written.
 */
export function getEveryDrawFlight({ event }: { event: Event }): Flight[] {
  const stored: Flight[] = getFlightProfile({ event }).flightProfile?.flights ?? [];
  const flightDrawIds = new Set(stored.map(({ drawId }) => drawId));
  let flightNumber = Math.max(0, ...stored.map(({ flightNumber }) => ensureInt(flightNumber) || 0));

  const synthesized: Flight[] = (event.drawDefinitions ?? [])
    .filter(({ drawId }) => !flightDrawIds.has(drawId))
    .map(({ drawId, drawName, entries }) => ({
      drawEntries: (entries ?? []).map((entry) => ({ ...entry })),
      flightNumber: (flightNumber += 1),
      manuallyAdded: true,
      drawName,
      drawId,
    }));

  return [...stored, ...synthesized];
}
