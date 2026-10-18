import { eventAttributesKey, modifyEventNoticeIfChanged } from '@Mutate/events/eventChangeNotice';
import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { compareTieFormats } from '@Query/hierarchical/tieFormats/compareTieFormats';
import { allEventMatchUps } from '@Query/matchUps/getAllEventMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { UUID } from '@Tools/UUID';

// constants and types
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { DrawDefinition, Structure, Tournament } from '@Types/tournamentTypes';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type AggreateTieFormatsArgs = {
  tournamentRecord: Tournament;
};
export function aggregateTieFormats({
  tournamentRecord,
}: AggreateTieFormatsArgs): ResultType & { addedCount?: number } {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  let addedCount = 0;

  const tournamentId = tournamentRecord.tournamentId;

  for (const event of tournamentRecord.events ?? []) {
    const eventBefore = eventAttributesKey(event);
    const tieFormats = event.tieFormats ?? [];

    // returns whether obj's inline tieFormat was replaced by a tieFormatId
    const checkTieFormat = (obj): boolean => {
      if (!obj.tieFormat) return false;

      let identifiedTieFormatId;
      for (const tieFormat of tieFormats) {
        const different = compareTieFormats({
          descendant: obj.tieFormat,
          ancestor: tieFormat,
        }).different;
        if (!different) identifiedTieFormatId = tieFormat.tieFormatId;
      }

      if (identifiedTieFormatId) {
        obj.tieFormatId = identifiedTieFormatId;
        delete obj.tieFormat;
      } else {
        const newTieFormat = makeDeepCopy(obj.tieFormat, undefined, true);
        newTieFormat.tieFormatId ??= UUID();

        obj.tieFormatId = newTieFormat.tieFormatId;
        delete obj.tieFormat;

        tieFormats.push(newTieFormat);
        addedCount += 1;
      }
      return true;
    };

    checkTieFormat(event);

    for (const drawDefinition of event.drawDefinitions ?? []) {
      aggregateDrawTieFormats({ checkTieFormat, drawDefinition, tournamentId, eventId: event.eventId });
    }

    // `modifyMatchUpNotice` resolves the notice's `structureId` from the drawDefinition, so it needs
    // the draw this matchUp belongs to. The matchUps come from `allEventMatchUps` over this same
    // event, so every `drawId` resolves; a miss would mean a matchUp that is not from these draws.
    const drawDefinitionsByDrawId = new Map((event.drawDefinitions ?? []).map((dd) => [dd.drawId, dd]));

    const setTieFormatId = (matchUpId, tieFormatId) => {
      const matchUp = eventMatchUpResult.matchUps?.find((matchUp) => matchUp.matchUpId === matchUpId);
      // Resolved for the NOTICE only. It must never gate the assignment below: doing so made a
      // missing draw skip the tieFormatId write itself, which broke 10 tieFormat tests.
      const drawDefinition = matchUp?.drawId ? drawDefinitionsByDrawId.get(matchUp.drawId) : undefined;
      if (matchUp) {
        matchUp.tieFormatId = tieFormatId;
        delete matchUp.tieFormat;
        modifyMatchUpNotice({
          tournamentId,
          eventId: event.eventId,
          drawDefinition,
          matchUp,
          event,
        });
      }
    };
    const addNewTieFormat = (inContextMatchUp) => {
      const newTieFormat = makeDeepCopy(inContextMatchUp.tieFormat, undefined, true);
      newTieFormat.tieFormatId ??= UUID();
      tieFormats.push(newTieFormat);
      addedCount += 1;

      setTieFormatId(inContextMatchUp.matchUpId, newTieFormat.tieFormatId);
    };

    const eventMatchUpResult = allEventMatchUps({
      matchUpFilters: { matchUpTypes: [TEAM_MATCHUP] },
      event,
    });

    const inContextMatchUps = eventMatchUpResult.matchUps ?? [];

    for (const inContextMatchUp of inContextMatchUps) {
      let identifiedTieFormatId;
      for (const tieFormat of tieFormats) {
        const different =
          inContextMatchUp.tieFormat &&
          compareTieFormats({
            descendant: inContextMatchUp.tieFormat,
            ancestor: tieFormat,
          }).different;
        if (!different) identifiedTieFormatId = tieFormat.tieFormatId;
      }
      if (identifiedTieFormatId) {
        setTieFormatId(inContextMatchUp.matchUpId, identifiedTieFormatId);
      } else {
        addNewTieFormat(inContextMatchUp);
      }
    }
    if (tieFormats.length) event.tieFormats = tieFormats;
    // event.tieFormats and the event's own tieFormat/tieFormatId are event attributes
    modifyEventNoticeIfChanged({ tournamentId, before: eventBefore, event });
  }

  return { ...SUCCESS, addedCount };
}

type AggregateDrawTieFormatsArgs = {
  checkTieFormat: (obj: DrawDefinition | Structure) => boolean;
  drawDefinition: DrawDefinition;
  tournamentId: string;
  eventId: string;
};

// a draw or structure whose inline tieFormat became a tieFormatId reference is a modified draw
function aggregateDrawTieFormats({
  checkTieFormat,
  drawDefinition,
  tournamentId,
  eventId,
}: AggregateDrawTieFormatsArgs) {
  const drawModified = checkTieFormat(drawDefinition);
  const structureIds: string[] = [];
  for (const structure of drawDefinition.structures ?? []) {
    if (checkTieFormat(structure)) structureIds.push(structure.structureId);
  }
  if (drawModified || structureIds.length) {
    modifyDrawNotice({
      structureIds: drawModified ? undefined : structureIds,
      drawDefinition,
      tournamentId,
      eventId,
    });
  }
}
