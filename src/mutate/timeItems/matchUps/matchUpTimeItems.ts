import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { addTimeItem } from '@Mutate/timeItems//addTimeItem';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { DrawDefinition, Event, TimeItem, Tournament } from '@Types/tournamentTypes';
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

/*
  generic function to addMatchUpTimeItem
  must retrieve matchUp WITHOUT CONTEXT so original can be modified
*/

type AddMatchUpTimeItem = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  removePriorValues?: boolean;
  duplicateValues?: boolean;
  disableNotice?: boolean;
  timeItem: TimeItem;
  matchUpId: string;
  event?: Event;
};
export function addMatchUpTimeItem({
  removePriorValues,
  tournamentRecord,
  duplicateValues,
  drawDefinition,
  disableNotice,
  matchUpId,
  timeItem,
  event,
}: AddMatchUpTimeItem) {
  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };

  const result = addTimeItem({
    removePriorValues,
    element: matchUp,
    duplicateValues,
    timeItem,
  });
  if (!disableNotice) {
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: event?.eventId,
      event,
      context: 'addTimeItem',
      drawDefinition,
      matchUp,
    });
  }
  return result;
}

type ResetMatchUpTimeItemsArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  matchUpId: string;
  event?: Event;
};
export function resetMatchUpTimeItems({
  tournamentRecord,
  drawDefinition,
  matchUpId,
  event,
}: ResetMatchUpTimeItemsArgs) {
  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };
  matchUp.timeItems = [];
  modifyMatchUpNotice({
    tournamentId: tournamentRecord?.tournamentId,
    context: 'resetTimeItems',
    eventId: event?.eventId,
    event,
    drawDefinition,
    matchUp,
  });
  return { ...SUCCESS };
}
