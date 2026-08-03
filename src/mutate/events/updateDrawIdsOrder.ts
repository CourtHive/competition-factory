import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { intersection, unique } from '@Tools/arrays';

// constants
import { INVALID_VALUES, MISSING_EVENT, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function updateDrawIdsOrder({
  event,
  tournamentRecord,
  disableNotice,
  orderedDrawIdsMap,
}: {
  event?: any;
  tournamentRecord?: any;
  disableNotice?: boolean;
  orderedDrawIdsMap?: any;
}) {
  if (typeof event !== 'object') return { error: MISSING_EVENT };
  if (!orderedDrawIdsMap) return { error: MISSING_VALUE, info: 'Missing drawIdsOrderMap' };
  if (typeof orderedDrawIdsMap !== 'object')
    return {
      error: INVALID_VALUES,
      info: 'orderedDrawIdsMap must be an object',
    };

  const drawOrders: number[] = Object.values(orderedDrawIdsMap);

  const validDrawOrders = drawOrders.every((drawOrder) => !Number.isNaN(Number(drawOrder)));
  if (!validDrawOrders) return { error: INVALID_VALUES, info: 'drawOrder must be numeric' };

  if (unique(drawOrders).length !== drawOrders.length)
    return {
      info: 'drawOrder values must be unique',
      error: INVALID_VALUES,
    };

  if (event.drawDefinitions?.length) {
    const drawIds = (event.drawDefinitions ?? []).map(({ drawId }) => drawId);
    const orderedDrawIds = Object.keys(orderedDrawIdsMap);
    if (orderedDrawIds?.length && intersection(drawIds, orderedDrawIds).length !== drawIds.length)
      return { error: INVALID_VALUES, info: 'Missing drawIds' };

    const tournamentId = tournamentRecord?.tournamentId;
    event.drawDefinitions.forEach((drawDefinition) => {
      drawDefinition.drawOrder = orderedDrawIdsMap[drawDefinition.drawId];
      // drawOrder lives on the drawDefinition → MODIFY_DRAW_DEFINITION covers it
      if (!disableNotice) modifyDrawNotice({ drawDefinition, tournamentId, eventId: event.eventId });
    });
  }

  const { flightProfile } = getFlightProfile({ event });
  flightProfile?.flights?.forEach((flight) => {
    flight.flightNumber = orderedDrawIdsMap[flight.drawId];
  });

  // flightProfile (flight ordering) is an event-scoped attribute → MODIFY_EVENT
  if (!disableNotice && flightProfile?.flights?.length) {
    modifyEventNotice({ event, tournamentId: tournamentRecord?.tournamentId });
  }

  return { ...SUCCESS };
}
