import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { requireParams } from '@Helpers/parameters/requireParams';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { deleteDrawDefinitions } from './deleteDrawDefinitions';

// constants
import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function deleteFlightProfileAndFlightDraws({ autoPublish = true, tournamentRecord, auditData, event, force }) {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  const { flightProfile } = getFlightProfile({ event });

  if (flightProfile) {
    const drawIds = flightProfile.flights?.map(({ drawId }) => drawId).filter(Boolean);

    const result = deleteDrawDefinitions({
      eventId: event.eventId,
      tournamentRecord,
      autoPublish,
      auditData,
      drawIds,
      event,
      force,
    });
    if (result.error) return result;

    const removal = setFirstClassOrExtension({
      element: event,
      attribute: 'flightProfile',
      name: FLIGHT_PROFILE,
      value: undefined,
    });
    // the flight profile is an event attribute: removing it modifies the event
    if (!removal.error) modifyEventNotice({ tournamentId: tournamentRecord.tournamentId, event });
    return removal;
  }

  return { ...SUCCESS };
}
