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
  // a flight is placed by its draw's display order, else its own, else its number (its level). A copy: sorting the
  // stored array reordered the flights in the profile itself
  const drawOrderOf = new Map((event.drawDefinitions ?? []).map(({ drawId, drawOrder }) => [drawId, drawOrder]));
  const placement = (flight) => drawOrderOf.get(flight.drawId) ?? flight.drawOrder ?? flight.flightNumber;
  const orderedFlightDrawIds = [...(flightProfile?.flights ?? [])]
    .sort((a, b) => placement(a) - placement(b))
    .map((f) => f.drawId)
    .filter(Boolean);
  const orderedDrawIds =
    event.drawDefinitions
      ?.sort((a, b) => a.drawOrder - b.drawOrder)
      .map((d) => d.drawId)
      .filter(Boolean)
      .filter((drawId) => !orderedFlightDrawIds.includes(drawId)) ?? [];

  const orderedDrawIdsMap = Object.assign(
    {},
    ...[...orderedFlightDrawIds, ...orderedDrawIds].map((drawId, i) => ({ [drawId]: i + 1 })),
  );

  // updateDrawIdsOrder dispatches MODIFY_EVENT; thread tournamentRecord through
  // so the notice carries the tournamentId.
  return orderedDrawIdsMap ? updateDrawIdsOrder({ event, tournamentRecord, orderedDrawIdsMap }) : { ...SUCCESS };
}
