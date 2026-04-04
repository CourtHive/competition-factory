import { deleteDrawDefinitions } from '@Mutate/events/deleteDrawDefinitions';
import { addEventExtension } from '@Mutate/extensions/addRemoveExtensions';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { refreshEventDrawOrder } from './refreshEventDrawOrder';

// constants
import { TOURNAMENT_RECORD, DRAW_ID, EVENT } from '@Constants/attributeConstants';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';

export function deleteFlightAndFlightDraw({ autoPublish = true, tournamentRecord, auditData, drawId, event, force }) {
  const paramsCheck = requireParams({ tournamentRecord, drawId, event }, [TOURNAMENT_RECORD, DRAW_ID, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  const { flightProfile } = getFlightProfile({ event });

  if (flightProfile) {
    const flight = flightProfile.flights?.find((flight) => flight.drawId === drawId);

    if (flight) {
      const flights = flightProfile.flights.filter((flight) => {
        return flight.drawId !== drawId;
      });

      const extension = {
        name: FLIGHT_PROFILE,
        value: {
          ...flightProfile,
          flights,
        },
      };

      addEventExtension({ event, extension });
    }
  }

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

  return refreshEventDrawOrder({ tournamentRecord, event });
}
