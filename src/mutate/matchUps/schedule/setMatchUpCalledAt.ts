import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import {
  INVALID_VALUES,
  MATCHUP_NOT_FOUND,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP_ID,
} from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type SetMatchUpCalledAtArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  disableNotice?: boolean;
  // ISO timestamp string when the matchUp is placed on the TMX active strip;
  // null or undefined clears the previous value (explicit removal).
  calledAt?: string | null;
  matchUpId: string;
  event?: Event;
};

/**
 * Set or clear `matchUp.schedule.calledAt` — the ISO-string timestamp captured
 * at the moment a tournament director deliberately drag-drops a matchUp onto
 * the TMX "active strip" / NOW row, signalling that the matchUp is imminent
 * ("calling the match to court").
 *
 * Semantics:
 *  - Pass an ISO string to set the timestamp.
 *  - Pass `null` or `undefined` to clear (explicit removal).
 *  - Subsequent set calls overwrite the prior value.
 *  - Persists past START_TIME as a historical record — NOT auto-cleared on
 *    lifecycle transition. Clear only via explicit removal.
 *  - Distinct from `scheduledTime` (plan), `courtId` (place), and the
 *    `START_TIME` timeItem (actually started). May coexist with all of them.
 *  - This is a CODES 5.0.0 NEW first-class attribute — no legacy timeItem
 *    mirror, no LEGACY/DUAL/NATIVE branching. The attribute is always
 *    written to `matchUp.schedule.calledAt`.
 */
export function setMatchUpCalledAt(params: SetMatchUpCalledAtArgs) {
  const stack = 'setMatchUpCalledAt';
  const { tournamentRecord, drawDefinition, disableNotice, calledAt, matchUpId, event } = params;

  if (!drawDefinition) return decorateResult({ result: { error: MISSING_DRAW_DEFINITION }, stack });
  if (!matchUpId) return decorateResult({ result: { error: MISSING_MATCHUP_ID }, stack });
  if (calledAt !== undefined && calledAt !== null && typeof calledAt !== 'string') {
    return decorateResult({ result: { error: INVALID_VALUES }, stack, info: 'calledAt must be an ISO string' });
  }

  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (!matchUp) return decorateResult({ result: { error: MATCHUP_NOT_FOUND }, stack });

  if (calledAt === undefined || calledAt === null) {
    if (matchUp.schedule) delete matchUp.schedule.calledAt;
  } else {
    if (!matchUp.schedule) matchUp.schedule = {};
    matchUp.schedule.calledAt = calledAt;
  }

  if (!disableNotice) {
    modifyMatchUpNotice({
      drawDefinition,
      tournamentId: tournamentRecord?.tournamentId,
      context: stack,
      matchUp,
    });
  }

  return { ...SUCCESS };
}
