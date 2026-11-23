import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { deleteDrawDefinitions } from '@Mutate/events/deleteDrawDefinitions';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { refreshEventDrawOrder } from './refreshEventDrawOrder';

// constants
import { TOURNAMENT_RECORD, DRAW_ID, EVENT } from '@Constants/attributeConstants';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';

export function deleteFlightAndFlightDraw({ autoPublish = true, tournamentRecord, auditData, drawId, event, force }) {
  const paramsCheck = requireParams({ tournamentRecord, drawId, event }, [TOURNAMENT_RECORD, DRAW_ID, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  // the draw goes first: deleteDrawDefinitions can refuse (scores present without `force`), and it refuses before it
  // writes, so the flight must not be removed until the draw deletion has succeeded
  const drawWasGenerated = event.drawDefinitions?.find((drawDefinition) => drawDefinition.drawId === drawId);
  if (drawWasGenerated) {
    const result = deleteDrawDefinitions({
      drawIds: [drawId],
      eventId: event.eventId,
      tournamentRecord,
      autoPublish,
      auditData,
      event,
      force,
    });
    if (result.error) return result;
  }

  // read after the draw deletion, which rewrites the profile
  const { flightProfile } = getFlightProfile({ event });

  if (flightProfile) {
    const flight = flightProfile.flights?.find((flight) => flight.drawId === drawId);

    if (flight) {
      const flights = flightProfile.flights.filter((flight) => {
        return flight.drawId !== drawId;
      });

      setFirstClassOrExtension({
        element: event,
        attribute: 'flightProfile',
        name: FLIGHT_PROFILE,
        value: { ...flightProfile, flights },
      });
    }
  }

  return refreshEventDrawOrder({ tournamentRecord, event });
}
