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

type ApplyMatchUpFormatArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  structureIds?: string[];
  matchUpFormat: string;
  structureId?: string;
  matchUpId?: string;
  event?: Event;
};

/**
 * Writes a `matchUpFormat` onto the matchUps identified by the params — one matchUp, a structure, or
 * a set of structures.
 *
 * NOT public. `setMatchUpFormat` is the exported engine method; this is the worker it delegates to,
 * shared with `setMatchUpStatus` and `checkFormatScopeEquivalence`.
 */
export function applyMatchUpFormat(params: ApplyMatchUpFormatArgs): {
  success?: boolean;
  error?: ErrorType;
  info?: string;
} {
  let structureIds = params.structureIds;
  const { tournamentRecord, drawDefinition, matchUpFormat, structureId, matchUpId, event } = params;

  const paramsCheck = checkRequiredParameters(params, [{ [DRAW_DEFINITION]: true, [MATCHUP_FORMAT]: true }]);
  if (paramsCheck.error) return paramsCheck;

  if (!isValidMatchUpFormat({ matchUpFormat })) return { error: UNRECOGNIZED_MATCHUP_FORMAT };
  // DELIBERATELY still the PUBLIC entry point's name, not this function's. `stack` is surfaced in
  // decorated errors, and `setMatchUpFormat` is the only one of the two a consumer can call or
  // recognise. Not a missed rename.
  const stack = 'setMatchUpFormat';

  if (matchUpId) {
    const check = checkMatchUpFormatApplication({ drawDefinition, matchUpFormat, matchUpId, event });
    if (check.error) return check;
    const matchUp = check.matchUp;

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

/**
 * The refusals `applyMatchUpFormat` raises for a SINGLE matchUp, without the write.
 *
 * `setMatchUpStatus` accepts a `matchUpFormat` alongside an outcome, and used to apply it through
 * `applyMatchUpFormat` before the outcome was validated — so a REFUSED outcome still left the new
 * format on the matchUp. A rejected call must change nothing, which is the `ERROR_IMPLIES_NO_MUTATION`
 * property the exit-propagation harness asserts.
 *
 * The write it used to perform is redundant on the success path: every outcome path funnels through
 * `modifyMatchUpScore`, whose `applyScoreAndStatus` does `if (matchUpFormat) matchUp.matchUpFormat =
 * matchUpFormat`. So the refusals move up and the write moves down, rather than the format being
 * resolved-but-not-persisted through a parallel path that could drift from this one.
 *
 * Shared with `applyMatchUpFormat` deliberately — two spellings of "may this format be applied here"
 * is exactly how a guard and its writer come to disagree.
 */
export function checkMatchUpFormatApplication(params: {
  drawDefinition: DrawDefinition;
  matchUpFormat: string;
  matchUpId: string;
  event?: Event;
}): { matchUp?: any; error?: ErrorType; info?: string } {
  const { drawDefinition, matchUpFormat, matchUpId, event } = params;

  if (!isValidMatchUpFormat({ matchUpFormat })) return { error: UNRECOGNIZED_MATCHUP_FORMAT };

  const result = findDrawMatchUp({ drawDefinition, matchUpId, event });
  if (result.error) return { error: result.error };

  if (result.matchUp?.matchUpType === TEAM)
    return {
      info: 'Cannot set matchUpFormat when { matchUpType: TEAM }',
      error: INVALID_MATCHUP,
    };

  return { matchUp: result.matchUp };
}
