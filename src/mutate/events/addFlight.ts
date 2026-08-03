import { setFirstClassOrExtension } from '../extensions/setFirstClassOrExtension';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { getParticipantId } from '@Functions/global/extractors';
import { intersection } from '@Tools/arrays';
import { ensureInt } from '@Tools/ensureInt';
import { UUID } from '@Tools/UUID';

// constants
import { EXISTING_FLIGHT, INVALID_VALUES, MISSING_EVENT, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { Entry, Event, Tournament } from '@Types/tournamentTypes';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';

type AddFlightArgs = {
  qualifyingPositions?: number;
  tournamentRecord?: Tournament;
  disableNotice?: boolean;
  drawEntries?: Entry[];
  drawName?: string;
  drawId: string;
  stage?: string;
  event: Event;
};
export function addFlight({
  qualifyingPositions,
  tournamentRecord,
  disableNotice,
  drawEntries = [], // [{ entryPosition, entryStatus, participantId }]
  drawName,
  drawId,
  event,
  stage,
}: AddFlightArgs) {
  const stack = 'addFlight';
  if (!event) return decorateResult({ result: { error: MISSING_EVENT }, stack });
  if (!drawName) return decorateResult({ result: { error: MISSING_VALUE }, stack });

  if (drawEntries?.length) {
    // check that all drawEntries are in event.entries
    const enteredParticipantIds = (event.entries ?? []).map(getParticipantId);
    const flightParticipantIds = drawEntries.map(getParticipantId);
    if (intersection(flightParticipantIds, enteredParticipantIds).length !== flightParticipantIds.length) {
      return decorateResult({ result: { error: INVALID_VALUES }, stack });
    }
  }

  const flightProfile = getFlightProfile({ event })?.flightProfile;

  const flightNumbers =
    flightProfile?.flights
      ?.map(({ flightNumber }) => !Number.isNaN(Number(flightNumber)) && ensureInt(flightNumber))
      ?.filter(Boolean) ?? [];

  const flightNumber = Math.max(0, ...flightNumbers) + 1;

  const flightDrawId = drawId || UUID();
  const flight: any = {
    drawId: flightDrawId,
    flightNumber,
    drawEntries,
    drawName,
  };

  if (stage) flight.stage = stage;
  if (qualifyingPositions) flight.qualifyingPositions = qualifyingPositions;

  const flightExists = (flightProfile?.flights ?? []).find(({ drawId }) => drawId === flight.drawId);
  if (flightExists) return decorateResult({ result: { error: EXISTING_FLIGHT }, stack });

  const flights = (flightProfile?.flights ?? []).concat(flight);

  const result = setFirstClassOrExtension({
    element: event,
    attribute: 'flightProfile',
    name: FLIGHT_PROFILE,
    value: { ...flightProfile, flights },
  });
  if (result.error) return result;

  if (!disableNotice) modifyEventNotice({ event, tournamentId: tournamentRecord?.tournamentId });

  return result;
}
