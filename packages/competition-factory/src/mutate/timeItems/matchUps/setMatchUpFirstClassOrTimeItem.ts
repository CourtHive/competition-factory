import { setFirstClassOrTimeItem } from '@Mutate/timeItems/setFirstClassOrTimeItem';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { DrawDefinition, Event, MatchUp, Tournament } from '@Types/tournamentTypes';
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { ResultType } from '@Types/factoryTypes';

type SetMatchUpFirstClassOrTimeItemArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  removePriorValues?: boolean;
  duplicateValues?: boolean;
  disableNotice?: boolean;
  itemSubTypes?: string[];
  itemDate?: string;
  matchUpId: string;
  attribute: string;
  itemType: string;
  value: any;
  event?: Event;
  /** a schedule plan's working copy of the matchUp, written in its place; internal (a caller's `matchUp` is never written) */
  workingMatchUp?: MatchUp;
};

/**
 * MatchUp-scoped wrapper around `setFirstClassOrTimeItem` that mirrors the
 * existing `addMatchUpTimeItem` surface: it resolves the matchUp via
 * `findDrawMatchUp`, delegates to the mode-aware helper, then emits the
 * standard `modifyMatchUpNotice`.
 *
 * Drop-in replacement for `addMatchUpTimeItem` in factory writers that
 * promote a schedule timeItem to a first-class `matchUp.schedule.*`
 * attribute in CODES.
 */
export function setMatchUpFirstClassOrTimeItem({
  tournamentRecord,
  removePriorValues,
  duplicateValues,
  drawDefinition,
  disableNotice,
  itemSubTypes,
  itemDate,
  matchUpId,
  attribute,
  itemType,
  value,
  event,
  workingMatchUp,
}: SetMatchUpFirstClassOrTimeItemArgs): ResultType {
  const matchUp = workingMatchUp ?? findDrawMatchUp({ drawDefinition, event, matchUpId }).matchUp;
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };

  const result = setFirstClassOrTimeItem({
    element: matchUp,
    scheduleObject: 'schedule',
    removePriorValues,
    duplicateValues,
    itemSubTypes,
    itemDate,
    attribute,
    itemType,
    value,
  });
  if (result.error) return result;

  if (!disableNotice) {
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: event?.eventId,
      event,
      context: 'setFirstClassOrTimeItem',
      drawDefinition,
      matchUp,
    });
  }
  return result;
}
