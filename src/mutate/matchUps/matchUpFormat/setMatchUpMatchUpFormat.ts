import { modifyDrawNotice, modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { isValidMatchUpFormat } from '@Validators/isValidMatchUpFormat';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { findStructure } from '@Acquire/findStructure';

// constants and types
import { DRAW_DEFINITION, MATCHUP_FORMAT } from '@Constants/attributeConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { TEAM } from '@Constants/eventConstants';
import {
  UNRECOGNIZED_MATCHUP_FORMAT,
  INVALID_EVENT_TYPE,
  INVALID_MATCHUP,
  ErrorType,
} from '@Constants/errorConditionConstants';

type SetMatchUpMatchUpFormatArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  structureIds?: string[];
  matchUpFormat: string;
  structureId?: string;
  matchUpId?: string;
  event?: Event;
};

// internal use only; set matchUpFormat for a matchUp or structure

export function setMatchUpMatchUpFormat(params: SetMatchUpMatchUpFormatArgs): {
  success?: boolean;
  error?: ErrorType;
  info?: string;
} {
  let structureIds = params.structureIds;
  const { tournamentRecord, drawDefinition, matchUpFormat, structureId, matchUpId, event } = params;

  const paramsCheck = checkRequiredParameters(params, [{ [DRAW_DEFINITION]: true, [MATCHUP_FORMAT]: true }]);
  if (paramsCheck.error) return paramsCheck;

  if (!isValidMatchUpFormat({ matchUpFormat })) return { error: UNRECOGNIZED_MATCHUP_FORMAT };
  const stack = 'setMatchUpFormat';

  if (matchUpId) {
    const result = findDrawMatchUp({
      drawDefinition,
      matchUpId,
      event,
    });
    if (result.error) return result;
    const matchUp = result.matchUp;

    if (matchUp?.matchUpType === TEAM)
      return {
        info: 'Cannot set matchUpFormat when { matchUpType: TEAM }',
        error: INVALID_MATCHUP,
      };

    if (matchUp) {
      matchUp.matchUpFormat = matchUpFormat;
      modifyMatchUpNotice({
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event?.eventId,
        event,
        context: stack,
        drawDefinition,
        matchUp,
      });
    }
  } else if (Array.isArray(structureIds)) {
    if (event?.eventType === TEAM) return { error: INVALID_EVENT_TYPE };
    for (const structureId of structureIds) {
      const result = findStructure({ drawDefinition, structureId });
      if (result.error) return result;
      if (result.structure) result.structure.matchUpFormat = matchUpFormat;
    }
  } else if (structureId) {
    if (event?.eventType === TEAM) return { error: INVALID_EVENT_TYPE };
    const result = findStructure({ drawDefinition, structureId });
    if (result.error) return result;
    if (result.structure) result.structure.matchUpFormat = matchUpFormat;
  } else if (drawDefinition) {
    drawDefinition.matchUpFormat = matchUpFormat;
  }

  structureIds = structureIds ?? (structureId ? [structureId] : undefined);
  modifyDrawNotice({ drawDefinition, structureIds });

  return { ...SUCCESS };
}
