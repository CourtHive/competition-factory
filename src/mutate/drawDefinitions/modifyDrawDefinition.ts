import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { attachPolicies } from '@Mutate/extensions/policies/attachPolicies';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { modifyDrawName } from './modifyDrawName';
import { isObject } from '@Tools/objects';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { PolicyDefinitions, ResultType } from '@Types/factoryTypes';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type ModifyDrawArgs = {
  drawUpdates: { drawName: string; policyDefinitions: PolicyDefinitions };
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  drawId: string;
  event: Event;
};
export function modifyDrawDefinition({
  tournamentRecord,
  drawDefinition,
  drawUpdates,
  drawId,
  event,
}: ModifyDrawArgs): ResultType {
  if (!isObject(drawUpdates)) return { error: INVALID_VALUES };

  const flightProfile = getFlightProfile({ event }).flightProfile;

  const nameResult: any =
    drawUpdates.drawName &&
    modifyDrawName({
      drawName: drawUpdates.drawName,
      tournamentRecord,
      drawDefinition,
      flightProfile,
      drawId,
      event,
    });
  if (nameResult?.error) return nameResult?.error;

  const flight = nameResult?.flight || flightProfile?.flights?.find((flight) => flight.drawId === drawId);

  if (!flight && !drawDefinition) {
    return { error: MISSING_DRAW_DEFINITION };
  }

  if (flight) {
    setFirstClassOrExtension({
      element: event,
      attribute: 'flightProfile',
      name: FLIGHT_PROFILE,
      value: { ...flightProfile, flights: flightProfile.flights },
    });
  }

  if (drawDefinition) {
    if (drawUpdates.policyDefinitions) {
      attachPolicies({
        policyDefinitions: drawUpdates.policyDefinitions,
        drawDefinition,
      });
    }
    modifyDrawNotice({
      tournamentId: tournamentRecord?.tournamentId,
      drawDefinition,
    });
  }

  return { ...SUCCESS };
}
