import { requireParams } from '@Helpers/parameters/requireParams';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { updateDrawIdsOrder } from './updateDrawIdsOrder';

// constants
import { TOURNAMENT_RECORD, EVENT } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function refreshEventDrawOrder({ tournamentRecord, event }) {
  const paramsCheck = requireParams({ tournamentRecord, event }, [TOURNAMENT_RECORD, EVENT]);
  if (paramsCheck.error) return paramsCheck;

  const { flightProfile } = getFlightProfile({ event });
  const orderedFlightDrawIds = flightProfile?.flights
    ?.sort((a, b) => a.flightNumber - b.flightNumber)
    .map((f) => f.drawId)
    .filter(Boolean);
  const orderedDrawIds = event.drawDefinitions
    ?.sort((a, b) => a.drawOrder - b.drawOrder)
    .map((d) => d.drawId)
    .filter(Boolean)
    .filter((drawId) => !orderedFlightDrawIds?.includes(drawId));

  const orderedDrawIdsMap = Object.assign(
    {},
    ...[...(orderedFlightDrawIds ?? []), ...(orderedDrawIds ?? [])].map((drawId, i) => ({ [drawId]: i + 1 })),
  );

  return orderedDrawIdsMap ? updateDrawIdsOrder({ event, orderedDrawIdsMap }) : { ...SUCCESS };
}
