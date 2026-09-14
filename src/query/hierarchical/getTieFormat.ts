import { decorateResult } from '@Functions/global/decorateResult';
import { resolveTieFormat } from './tieFormats/resolveTieFormat';
import { copyTieFormat } from './tieFormats/copyTieFormat';
import { publicFindMatchUp } from '@Acquire/findMatchUp';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DrawDefinition, Event, MatchUp, Structure, TieFormat, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  MISSING_DRAW_ID,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

// NOTE: method exclusively for external use

type GetTieFormatArgs = {
  tournamentRecord: Tournament;
  drawDefinition?: DrawDefinition;
  structure?: Structure;
  structureId?: string;
  matchUpId: string;
  eventId?: string;
  drawId?: string;
  event?: Event;
};
export function getTieFormat({
  tournamentRecord, // passed in automatically by tournamentEngine
  drawDefinition, // passed in automatically by tournamentEngine when drawId provided
  structureId, // optional - if only the default matchUpFormat for a structure is required
  matchUpId, // id of matchUp for which the scoped matchUpFormat(s) are desired
  structure, // optional optimization - when structure already known
  eventId, // optional - if only the default matchUpFormat for an event is required
  drawId, // avoid brute force search for matchUp
  event, // passed in automatically by tournamentEngine when drawId or eventId provided
}: GetTieFormatArgs): {
  structureDefaultTieFormat?: TieFormat;
  eventDefaultTieFormat?: TieFormat;
  drawDefaultTieFormat?: TieFormat;
  tieFormat?: TieFormat;
  structure?: Structure;
  error?: ErrorType;
  success?: boolean;
  matchUp?: MatchUp;
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!drawId && !event && !structureId && !matchUpId)
    return decorateResult({
      result: { error: MISSING_VALUE },
      stack: 'getTieFormat',
    });

  if (eventId && !event) {
    event = tournamentRecord.events?.find((event) => event.eventId === eventId);
  }

  const matchUpResult = publicFindMatchUp({
    tournamentRecord,
    drawDefinition,
    matchUpId,
    drawId,
    event,
  });

  if (matchUpId && matchUpResult?.error) {
    return matchUpResult;
  } else if (!drawDefinition && matchUpResult?.drawDefinition) {
    drawDefinition = matchUpResult?.drawDefinition;
  }

  structure = structure ?? matchUpResult?.structure;
  if (!structure && structureId && !matchUpId) {
    if (!drawDefinition) return { error: MISSING_DRAW_ID };
    const structureResult = findStructure({ drawDefinition, structureId });
    if (structureResult.error) return structureResult;
    structure = structureResult.structure;
  }

  const structureDefaultTieFormat =
    (structure?.tieFormat ?? structure?.tieFormatId) &&
    resolveTieFormat({ structure, drawDefinition, event })?.tieFormat;
  const drawDefaultTieFormat =
    (drawDefinition?.tieFormat ?? drawDefinition?.tieFormatId) &&
    resolveTieFormat({
      drawDefinition,
      event,
    })?.tieFormat;
  const eventDefaultTieFormat = resolveTieFormat({ event })?.tieFormat;

  const tieFormat = resolveTieFormat({
    matchUp: matchUpResult?.matchUp,
    drawDefinition,
    structure,
    event,
  })?.tieFormat;

  return {
    ...SUCCESS,
    matchUp: matchUpResult?.matchUp,
    structureDefaultTieFormat: copyTieFormat(structureDefaultTieFormat),
    eventDefaultTieFormat: copyTieFormat(eventDefaultTieFormat),
    drawDefaultTieFormat: copyTieFormat(drawDefaultTieFormat),
    tieFormat: copyTieFormat(tieFormat),
    structure,
  };
}
