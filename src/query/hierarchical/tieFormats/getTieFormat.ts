import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { getObjectTieFormat } from './getObjectTieFormat';
import { findStructure } from '@Acquire/findStructure';
import { getItemTieFormat } from './getItemTieFormat';

// constants and types
import { DrawDefinition, Event, MatchUp, Structure, TieFormat } from '@Types/tournamentTypes';
import { TEAM_MATCHUP } from '@Constants/matchUpTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  ErrorType,
  INVALID_MATCHUP,
  MISSING_DRAW_DEFINITION,
  MISSING_TIE_FORMAT,
} from '@Constants/errorConditionConstants';

type GetTieFormatArgs = {
  drawDefinition?: DrawDefinition;
  structure?: Structure;
  structureId?: string;
  matchUpId?: string;
  matchUp?: MatchUp;
  eventId?: string;
  event?: Event;
};

export function getTieFormat({
  drawDefinition,
  structureId,
  matchUpId,
  structure,
  matchUp,
  eventId, // optional - if an eventId is present only return tieFormat for event
  event,
}: GetTieFormatArgs): ResultType & {
  structure?: Structure;
  tieFormat?: TieFormat;
  success?: boolean;
  matchUp?: MatchUp;
} {
  const stack = 'getTieFormat';
  let tieFormat;

  structureId = structure?.structureId ?? structureId;
  matchUpId = matchUp?.matchUpId ?? matchUpId;

  if ((matchUpId || structureId) && !drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  if (eventId && event) {
    tieFormat = getObjectTieFormat(event);
  } else if (matchUpId) {
    // if matchUpId is present, structure and drawDefinition are always required
    if (drawDefinition && (!matchUp || !structure)) {
      const result: {
        matchUp?: MatchUp;
        error?: ErrorType;
        structure?: Structure;
      } = findDrawMatchUp({
        drawDefinition,
        matchUpId,
      });
      if (result.error) return result;
      if (result.matchUp?.matchUpType !== TEAM_MATCHUP) {
        return decorateResult({ result: { error: INVALID_MATCHUP }, stack });
      }

      structure ??= result.structure;
      matchUp ??= result.matchUp;
    }

    tieFormat =
      getItemTieFormat({
        item: matchUp,
        drawDefinition,
        structure,
        event,
      }) ||
      getItemTieFormat({
        item: structure,
        drawDefinition,
        structure,
        event,
      }) ||
      getObjectTieFormat(drawDefinition) ||
      getObjectTieFormat(event);
  } else if (drawDefinition && structureId) {
    if (!structure) {
      const result = findStructure({ drawDefinition, structureId });
      if (result.error) return result;
      structure = result?.structure;
    }
    tieFormat =
      getItemTieFormat({
        item: structure,
        drawDefinition,
        structure,
        event,
      }) ||
      getObjectTieFormat(drawDefinition) ||
      getObjectTieFormat(event);
  } else {
    tieFormat = getObjectTieFormat(drawDefinition) || getObjectTieFormat(event);
  }

  if (!tieFormat) return decorateResult({ result: { error: MISSING_TIE_FORMAT }, stack });

  return {
    ...SUCCESS,
    structure,
    tieFormat,
    matchUp,
  };
}
