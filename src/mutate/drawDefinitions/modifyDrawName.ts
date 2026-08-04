import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { getFlightProfile } from '@Query/event/getFlightProfile';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { Flight, FlightProfile, ResultType } from '@Types/factoryTypes';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type ModifyDrawNameArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  flightProfile: FlightProfile;
  drawName: string;
  drawId: string;
  event: Event;
};
export function modifyDrawName({
  tournamentRecord,
  drawDefinition,
  flightProfile,
  drawName,
  drawId,
  event,
}: ModifyDrawNameArgs): ResultType & { flight?: Flight } {
  if (!drawName || typeof drawName !== 'string')
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { drawName },
    });

  if (!flightProfile) {
    flightProfile = getFlightProfile({ event }).flightProfile;
  }

  const flight = flightProfile?.flights?.find((flight) => flight.drawId === drawId);

  if (flight) {
    flight.drawName = drawName;
    setFirstClassOrExtension({
      element: event,
      attribute: 'flightProfile',
      name: FLIGHT_PROFILE,
      value: { ...flightProfile, flights: flightProfile.flights },
    });
    // event.flightProfile was mutated — cover the event change.
    modifyEventNotice({ tournamentId: tournamentRecord?.tournamentId, event });
  }

  if (drawDefinition) {
    drawDefinition.drawName = drawName;
    modifyDrawNotice({
      tournamentId: tournamentRecord?.tournamentId,
      drawDefinition,
    });
  }

  if (!flight && !drawDefinition) {
    return { error: MISSING_DRAW_DEFINITION };
  }

  return { ...SUCCESS, flight };
}
