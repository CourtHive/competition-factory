import { decorateResult } from '@Functions/global/decorateResult';
import { getFlightProfile } from '@Query/event/getFlightProfile';

// constants and types
import { DRAW_DEFINITION_NOT_FOUND, EVENT_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Tournament, Event } from '@Types/tournamentTypes';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';

type FindEventArgs = {
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  eventId?: string;
  drawId?: string;
};
export function findEvent(params: FindEventArgs): ResultType & {
  drawDefinition?: DrawDefinition;
  tournamentId?: string;
  event?: Event;
} {
  const { tournamentRecord, eventId, drawId } = params;

  const stack = 'findEvent';
  const eventIdsMap = {};
  const tournamentRecords =
    params.tournamentRecords ??
    (tournamentRecord && {
      [tournamentRecord.tournamentId]: tournamentRecord,
    }) ??
    {};

  const events = Object.values(tournamentRecords)
    .map(({ events, tournamentId }) => {
      if (events) {
        events.forEach((event) => {
          eventIdsMap[event.eventId] = { tournamentId };
        });
      }
      return events ?? [];
    })
    .flat();

  let tournamentId;

  if (drawId) {
    let drawDefinition;
    const event = events.find((event) => {
      const drawDefinitions = event?.drawDefinitions ?? [];
      const targetDrawDefinition = drawDefinitions.find((drawDefinition) => drawDefinition.drawId === drawId);
      if (targetDrawDefinition) {
        drawDefinition = targetDrawDefinition;
        tournamentId = eventIdsMap[event.eventId].tournamentId;
      } else {
        const flightProfile = event && getFlightProfile({ event })?.flightProfile;

        const flight = flightProfile?.flights?.find((flight) => flight.drawId === drawId);

        if (flight) {
          tournamentId = eventIdsMap[event.eventId].tournamentId;
          return {
            entries: flight.drawEntries,
            drawName: flight.drawName,
            tournamentId,
            drawId,
          };
        }
      }
      return targetDrawDefinition;
    });

    if (event) return { event, drawDefinition, tournamentId };
  }

  if (eventId) {
    const event = events.find((event) => event?.eventId === eventId);
    if (!event) {
      return {
        event: undefined,
        drawDefinition: undefined,
        ...decorateResult({ result: { error: EVENT_NOT_FOUND }, stack }),
      };
    } else {
      tournamentId = eventIdsMap[event.eventId].tournamentId;
    }
    return { event, drawDefinition: undefined, tournamentId };
  }

  return {
    event: undefined,
    drawDefinition: undefined,
    ...decorateResult({
      result: { error: DRAW_DEFINITION_NOT_FOUND },
      context: { drawId, eventId },
      stack,
    }),
  };
}
