import { setFirstClassOrExtension } from '../extensions/setFirstClassOrExtension';
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

    return setFirstClassOrExtension({
      element: event,
      attribute: 'flightProfile',
      name: FLIGHT_PROFILE,
      value: undefined,
    });
  }

  return { ...SUCCESS };
}
