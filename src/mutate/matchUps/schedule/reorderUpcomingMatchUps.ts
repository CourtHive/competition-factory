import { addMatchUpScheduledTime } from '@Mutate/matchUps/schedule/scheduledTime';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawDefinition } from '@Acquire/findDrawDefinition';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { validTimeValue } from '@Tools/dateTime';

// constants and types
import { DrawDefinition, MatchUp } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  DRAW_DEFINITION_NOT_FOUND,
  INVALID_TIME,
  MISSING_TOURNAMENT_RECORDS,
  MISSING_VALUE,
  MODIFICATIONS_FAILED,
  ErrorType,
} from '@Constants/errorConditionConstants';

type Resolved = { drawDefinition: DrawDefinition; matchUp: MatchUp; error?: undefined } | { error: ErrorType };
type Assignment = { drawDefinition: DrawDefinition; matchUp: MatchUp; matchUpId: string; scheduledTime?: string };

/**
 * Reorders an array of time-ordered matchUps by re-assigning their times
 * Assumes:
 * 1. that only the matchUps which need to be reordered are present in the matchUpContextIds array
 * 2. that either a match has moved from the bottom of the group to the top or vice-versa
 *
 * Only `scheduledTime` moves. The list is ordered by time, not by a court's order of play, and may span courts,
 * so `courtOrder` (a row on one court's grid) is deliberately left where it is.
 */
export function reorderUpcomingMatchUps(params) {
  const stack = 'reorderUpcomingMatchUps';
  const { tournamentRecords } = params;
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return decorateResult({
      result: { error: MISSING_TOURNAMENT_RECORDS },
      stack,
    });

  const { matchUpsContextIds, firstToLast } = params;
  if (!matchUpsContextIds) return decorateResult({ result: { error: MISSING_VALUE }, stack });

  const matchUpsCount = matchUpsContextIds?.length;
  if (!matchUpsCount) return { ...SUCCESS };

  // B5: every assignment is resolved BEFORE any is written. The writes used to run inside a forEach whose
  // `return` did not stop it, so one unresolvable matchUp left the others rotated (two matchUps sharing one
  // time) and then reported MODIFICATIONS_FAILED. A refused reorder now changes nothing.
  const assignments: Assignment[] = [];
  for (const [index, context] of matchUpsContextIds.entries()) {
    let calculatedIndex = index + (firstToLast ? -1 : 1);
    if (calculatedIndex < 0) calculatedIndex = matchUpsCount - 1;
    if (calculatedIndex === matchUpsCount) calculatedIndex = 0;
    const scheduledTime = matchUpsContextIds[calculatedIndex]?.schedule?.scheduledTime;

    const resolved = resolveAssignment({ tournamentRecords, context, scheduledTime });
    if (resolved.error) {
      return decorateResult({
        result: { error: MODIFICATIONS_FAILED },
        context: { matchUpId: context?.matchUpId, cause: resolved.error },
        stack,
      });
    }
    const { drawDefinition, matchUp } = resolved;
    assignments.push({ drawDefinition, matchUp, matchUpId: context.matchUpId, scheduledTime });
  }

  for (const { drawDefinition, matchUp, matchUpId, scheduledTime } of assignments) {
    const result = addMatchUpScheduledTime({ drawDefinition, scheduledTime, matchUpId, matchUp });
    if (result.error) return decorateResult({ result, stack });
  }

  return { ...SUCCESS };
}

function resolveAssignment({ tournamentRecords, context, scheduledTime }): Resolved {
  if (!validTimeValue(scheduledTime)) return { error: INVALID_TIME };
  const tournamentRecord = tournamentRecords[context?.tournamentId];
  const { drawDefinition } = findDrawDefinition({ tournamentRecord, drawId: context?.drawId });
  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  const { matchUp, error } = findDrawMatchUp({ drawDefinition, matchUpId: context?.matchUpId });
  if (error || !matchUp) return { error: error ?? MODIFICATIONS_FAILED };
  return { drawDefinition, matchUp };
}
