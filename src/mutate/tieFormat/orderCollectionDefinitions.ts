import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getAllStructureMatchUps } from '@Query/matchUps/getAllStructureMatchUps';
import { copyTieFormat } from '@Query/hierarchical/tieFormats/copyTieFormat';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { getTieFormat } from '@Query/hierarchical/getTieFormat';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { findStructure } from '@Acquire/findStructure';
import { isConvertableInteger } from '@Tools/math';
import { numericSortValue } from '@Tools/arrays';

// constants and types
import { INVALID_VALUES, MISSING_MATCHUP, NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/matchUpTypes';

function getOrderedTieFormat({ tieFormat, orderMap }) {
  const orderedTieFormat = copyTieFormat(tieFormat);
  orderedTieFormat.collectionDefinitions?.forEach((collectionDefinition) => {
    const collectionOrder = orderMap[collectionDefinition.collectionId];
    if (collectionOrder) collectionDefinition.collectionOrder = collectionOrder;
  });

  orderedTieFormat.collectionDefinitions?.sort(
    (a, b) => numericSortValue(a.collectionOrder) - numericSortValue(b.collectionOrder),
  );

  return orderedTieFormat;
}

type OrderCollectionDefinitionsArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  structureId?: string;
  matchUpId?: string;
  matchUp?: MatchUp;
  eventId?: string;
  orderMap: any;
  event?: Event;
};

export function orderCollectionDefinitions({
  tournamentRecord,
  drawDefinition,
  structureId,
  matchUpId,
  orderMap,
  eventId,
  matchUp,
  event,
}: OrderCollectionDefinitionsArgs) {
  if (typeof orderMap !== 'object' || !Object.values(orderMap).every((val) => isConvertableInteger(val)))
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { orderMap },
    });

  const result = structureId ? findStructure({ drawDefinition, structureId }) : undefined;
  if (result?.error) return result;
  const structure = result?.structure;

  if (eventId && event?.tieFormat) {
    updateEventTieFormat({ tournamentRecord, event, orderMap });
  } else if (matchUpId) {
    const result =
      drawDefinition &&
      findDrawMatchUp({
        drawDefinition,
        matchUpId,
      });

    if (result?.error) return result;

    matchUp = result.matchUp;
    if (!matchUp) return { error: MISSING_MATCHUP };

    const tieFormat = getTieFormat({ tournamentRecord, matchUpId, structure, drawDefinition, event })?.tieFormat;

    matchUp.tieFormat = getOrderedTieFormat({
      tieFormat,
      orderMap,
    });
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: event?.eventId,
      drawDefinition,
      matchUp,
    });
  } else if (structureId) {
    if (structure?.tieFormat) {
      structure.tieFormat = getOrderedTieFormat({
        tieFormat: structure.tieFormat,
        orderMap,
      });
      updateStructureMatchUps({
        eventId: event?.eventId,
        tournamentRecord,
        drawDefinition,
        structure,
        orderMap,
      });
      modifyDrawNotice({
        drawDefinition,
        structureIds: [structure.structureId],
      });
    } else if (drawDefinition.tieFormat) {
      updateDrawTieFormat({
        structureIds: [structureId],
        tournamentRecord,
        drawDefinition,
        orderMap,
        event,
      });
    } else if (event?.tieFormat) {
      updateEventTieFormat({
        structureIds: [structureId],
        tournamentRecord,
        orderMap,
        event,
      });
    } else {
      return { error: NOT_FOUND };
    }
  } else if (drawDefinition?.tieFormat) {
    updateDrawTieFormat({ tournamentRecord, drawDefinition, orderMap, event });
  } else {
    return { error: NOT_FOUND };
  }

  return { ...SUCCESS };
}

type UpdateEventTieFormatArgs = {
  tournamentRecord: Tournament;
  structureIds?: string[];
  orderMap?: any;
  event: Event;
};

function updateEventTieFormat({
  tournamentRecord,
  structureIds, // allow scoping to only specific structureIds
  orderMap,
  event,
}: UpdateEventTieFormatArgs) {
  const updatedFormat = getOrderedTieFormat({
    tieFormat: event.tieFormat,
    orderMap,
  });
  if (!structureIds?.length) {
    event.tieFormat = updatedFormat;
    // event.tieFormat is a first-class event attribute — cover the change.
    modifyEventNotice({ tournamentId: tournamentRecord?.tournamentId, event });
  }

  for (const drawDefinition of event.drawDefinitions ?? []) {
    updateDrawTieFormat({
      tournamentRecord,
      drawDefinition,
      structureIds,
      orderMap,
      event,
    });
  }
}

type UpdateDrawTieFormatArgs = {
  tournamentRecord: Tournament;
  drawDefinition: DrawDefinition;
  structureIds?: string[];
  orderMap?: any;
  event?: Event;
};

function updateDrawTieFormat({
  tournamentRecord,
  drawDefinition,
  structureIds,
  orderMap,
  event,
}: UpdateDrawTieFormatArgs) {
  const tieFormat = drawDefinition.tieFormat ?? event?.tieFormat;
  const updatedFormat = getOrderedTieFormat({
    tieFormat,
    orderMap,
  });
  if (!structureIds?.length) drawDefinition.tieFormat = updatedFormat;
  const modifiedStructureIds: string[] = [];

  for (const structure of drawDefinition.structures ?? []) {
    // if structureIds is present, only modify referenced structures
    if (structureIds?.length && !structureIds.includes(structure.structureId)) continue;

    if (structure.tieFormat || structureIds?.includes(structure.structureId))
      structure.tieFormat = getOrderedTieFormat({
        tieFormat: structure.tieFormat ?? drawDefinition.tieFormat ?? event?.tieFormat,
        orderMap,
      });
    updateStructureMatchUps({
      eventId: event?.eventId,
      tournamentRecord,
      drawDefinition,
      structure,
      orderMap,
    });
    modifiedStructureIds.push(structure.structureId);
  }
  modifyDrawNotice({ drawDefinition, structureIds: modifiedStructureIds });
}

function updateStructureMatchUps({ tournamentRecord, drawDefinition, structure, orderMap, eventId }) {
  const matchUps = getAllStructureMatchUps({
    matchUpFilters: { matchUpTypes: [TEAM] },
    structure,
  })?.matchUps;

  for (const matchUp of matchUps) {
    if (matchUp.tieFormat) {
      matchUp.tieFormat = getOrderedTieFormat({
        tieFormat: matchUp.tieFormat,
        orderMap,
      });
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        drawDefinition,
        eventId,
        matchUp,
      });
    }
  }
}
