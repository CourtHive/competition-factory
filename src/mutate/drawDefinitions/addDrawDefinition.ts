import { addEventExtension } from '@Mutate/extensions/addRemoveExtensions';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getFlightProfile } from '@Query/event/getFlightProfile';
import { getMatchUpId } from '@Functions/global/extractors';
import { ensureInt } from '@Tools/ensureInt';
import {
  addDrawNotice,
  addMatchUpsNotice,
  deleteMatchUpsNotice,
  modifyDrawNotice,
} from '@Mutate/notifications/drawNotifications';

// constants and types
import { STRUCTURE_SELECTED_STATUSES } from '@Constants/entryStatusConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { FLIGHT_PROFILE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  DRAW_ID_EXISTS,
  INVALID_DRAW_DEFINITION,
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_EVENT,
} from '@Constants/errorConditionConstants';

type AddDrawDefinitionArgs = {
  flight?: { flightNumber: number };
  suppressNotifications?: boolean;
  tournamentRecord?: Tournament;
  modifyEventEntries?: boolean;
  drawDefinition: DrawDefinition;
  existingDrawCount?: number;
  allowReplacement?: boolean;
  checkEntryStatus?: boolean;
  tournamentId?: string;
  event: Event;
};

export function addDrawDefinition(
  params: AddDrawDefinitionArgs,
): ResultType & { modifiedEventEntryStatusCount?: number } {
  const {
    flight: flightDefinition,
    suppressNotifications,
    modifyEventEntries, // event.entries[{entryStatus}] are modified to match draw.entries[{entryStatus}]
    existingDrawCount,
    allowReplacement,
    checkEntryStatus, // optional boolean to enable checking that flight.drawEntries match event.entries
    tournamentRecord,
    drawDefinition,
    event,
  } = params;
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!event) return { error: MISSING_EVENT };

  event.drawDefinitions ??= [];
  const { drawId, drawName, entries: drawEntries } = drawDefinition;
  const { entries: eventEntries } = event;
  let modifiedEventEntryStatusCount = 0;

  if (existingDrawCount !== undefined && existingDrawCount !== event.drawDefinitions.length)
    return { error: INVALID_VALUES, info: 'drawDefintions count mismatch' };

  const { flightProfile } = getFlightProfile({ event });
  const relevantFlight =
    flightDefinition && flightProfile?.flights?.find((flight) => flight.flightNumber === flightDefinition.flightNumber);

  // if there is a source drawId specified, the source draw must exist
  const sourceDrawId = flightProfile?.links?.find((link) => link?.target?.drawId === drawId)?.source?.drawId;
  const sourceDrawIdError =
    sourceDrawId && !event.drawDefinitions.some((drawDefinition) => drawDefinition.drawId === sourceDrawId);

  if (sourceDrawIdError)
    return decorateResult({
      result: { error: MISSING_DRAW_DEFINITION },
      info: { sourceDrawId },
    });

  const flightConflict = relevantFlight && relevantFlight.drawId !== drawDefinition.drawId;
  if (flightConflict) {
    return decorateResult({
      result: { error: INVALID_DRAW_DEFINITION },
      info: { relevantFlight },
    });
  }

  const validationResult: any = validateDrawEntries({
    drawEntries,
    eventEntries,
    relevantFlight,
    checkEntryStatus,
  });
  if (validationResult?.error) return validationResult;

  const { matchingEventEntries } = validationResult;

  if (modifyEventEntries) {
    modifiedEventEntryStatusCount = applyModifiedEventEntries({ drawEntries, eventEntries });
  }

  if (eventEntries && !matchingEventEntries)
    return decorateResult({
      result: {
        info: 'Draw entries do not match event entryStatuses',
        context: { matchingEventEntries, eventEntries },
        error: INVALID_DRAW_DEFINITION,
      },
    });

  const flightNumbers =
    flightProfile?.flights
      ?.map(({ flightNumber }) => !Number.isNaN(Number(flightNumber)) && ensureInt(flightNumber))
      ?.filter(Boolean) ?? [];

  const drawOrders =
    (event.drawDefinitions.map(({ drawOrder }) => drawOrder && ensureInt(drawOrder))?.filter(Boolean) as number[]) ||
    [];

  let drawOrder = Math.max(0, ...drawOrders, ...flightNumbers) + 1;

  const flight = flightProfile?.flights?.find((flight) => flight.drawId === drawId);

  let extension;
  if (flight) {
    // if this drawId was defined in a flightProfile...
    // ...update the flight.drawName with the drawName in the drawDefinition
    flight.drawName = drawDefinition.drawName;
    extension = {
      name: FLIGHT_PROFILE,
      value: {
        ...flightProfile,
        flights: flightProfile.flights,
      },
    };

    const flightNumber = flight.flightNumber;
    if (flightNumber && !drawOrders.includes(flightNumber)) {
      drawOrder = flightNumber;
    } else {
      flight.flightNumber = drawOrder;
    }
  } else {
    const flights = flightProfile?.flights ?? [];
    flights.push({
      manuallyAdded: true, // this drawDefinition was not part of automated split
      flightNumber: drawOrder,
      drawEntries,
      drawName,
      drawId,
    });
    extension = {
      name: FLIGHT_PROFILE,
      value: {
        ...flightProfile,
        flights,
      },
    };
  }

  addEventExtension({ event, extension });
  Object.assign(drawDefinition, { drawOrder });

  const existingDrawDefinition = event.drawDefinitions.find((dd) => dd.drawId === drawId);
  const tournamentId = tournamentRecord?.tournamentId;
  const eventId: string = event.eventId;

  if (existingDrawDefinition) {
    if (!allowReplacement) return { error: DRAW_ID_EXISTS };
    replaceExistingDraw({
      existingDrawDefinition,
      suppressNotifications,
      drawDefinition,
      tournamentId,
      eventId,
      event,
      drawId,
    });
  } else {
    addNewDraw({ suppressNotifications, tournamentRecord, drawDefinition, tournamentId, eventId, event });
  }

  return { ...SUCCESS, modifiedEventEntryStatusCount };
}

function validateDrawEntries({ drawEntries, eventEntries, relevantFlight, checkEntryStatus }) {
  const drawEntriesPresentInFlight = drawEntries?.every(({ participantId, entryStatus }) => {
    const flightEntry = relevantFlight?.drawEntries.find((entry) => entry.participantId === participantId);
    return !entryStatus || flightEntry?.entryStatus === entryStatus;
  });

  const matchingEventEntries =
    !checkEntryStatus ||
    (eventEntries &&
      drawEntries?.every(({ participantId, entryStatus, entryStage }) => {
        const eventEntry = eventEntries.find(
          (ee) => ee.participantId === participantId && (!ee.entryStage || ee.entryStage === entryStage),
        );
        return eventEntry?.entryStatus === entryStatus;
      }));

  if (relevantFlight && !drawEntriesPresentInFlight) {
    return decorateResult({
      result: { error: INVALID_DRAW_DEFINITION },
      context: { drawEntriesPresentInFlight, matchingEventEntries, relevantFlight },
      info: 'Draw entries are not present in flight or do not match entryStatuses',
    });
  }

  return { drawEntriesPresentInFlight, matchingEventEntries };
}

function applyModifiedEventEntries({ drawEntries, eventEntries }) {
  let count = 0;
  drawEntries?.filter(Boolean).forEach((drawEntry) => {
    if (drawEntry?.entryStatus && STRUCTURE_SELECTED_STATUSES.includes(drawEntry?.entryStatus)) {
      const eventEntry = eventEntries?.filter(Boolean).find((ee) => ee.participantId === drawEntry.participantId);
      if (eventEntry && drawEntry.entryStatus && eventEntry?.entryStatus !== drawEntry.entryStatus) {
        eventEntry.entryStatus = drawEntry.entryStatus;
        count += 1;
      }
    }
  });
  return count;
}

function replaceExistingDraw({
  existingDrawDefinition,
  suppressNotifications,
  drawDefinition,
  tournamentId,
  eventId,
  event,
  drawId,
}) {
  const existingMatchUps = allDrawMatchUps({ drawDefinition: existingDrawDefinition })?.matchUps;
  const existingMatchUpIds: string[] = existingMatchUps?.map(getMatchUpId) ?? [];
  const incomingMatchUps = allDrawMatchUps({ drawDefinition })?.matchUps;

  if (!suppressNotifications) {
    if (existingMatchUpIds?.length) {
      deleteMatchUpsNotice({
        matchUpIds: existingMatchUpIds,
        action: 'modifyDrawDefinition',
        tournamentId,
        eventId,
      });
    }
    if (incomingMatchUps?.length) {
      addMatchUpsNotice({ matchUps: incomingMatchUps, tournamentId, eventId });
    }

    event.drawDefinitions = event.drawDefinitions.map((d) => (d.drawId === drawId ? drawDefinition : d));

    const structureIds = drawDefinition.structures?.map(({ structureId }) => structureId);
    modifyDrawNotice({ drawDefinition, tournamentId, structureIds, eventId });
  }
}

function addNewDraw({ suppressNotifications, tournamentRecord, drawDefinition, tournamentId, eventId, event }) {
  event.drawDefinitions.push(drawDefinition);

  if (!suppressNotifications) {
    const { matchUps } = allDrawMatchUps({ drawDefinition, event });
    matchUps &&
      addMatchUpsNotice({
        tournamentId: tournamentRecord?.tournamentId,
        matchUps,
      });

    addDrawNotice({ drawDefinition, tournamentId, eventId });
  }
}
