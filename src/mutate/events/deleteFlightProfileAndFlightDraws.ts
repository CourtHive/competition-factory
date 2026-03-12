import { removeEventExtension } from '../extensions/addRemoveExtensions';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { deleteDrawDefinitions } from './deleteDrawDefinitions';

// constants
import { MISSING_EVENT, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function deleteFlightProfileAndFlightDraws({ autoPublish = true, tournamentRecord, auditData, event, force }) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!event) return { error: MISSING_EVENT };

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

    return removeEventExtension({ event, name: FLIGHT_PROFILE });
  }

  return { ...SUCCESS };
}
