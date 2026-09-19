import { appendFirstClassOrTimeItem } from '@Mutate/timeItems/appendFirstClassOrTimeItem';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { getMatchUpPresence } from '@Acquire/presenceAttestations';
import { addTimeItem } from '@Mutate/timeItems//addTimeItem';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { DrawDefinition, Event, TimeItem, Tournament } from '@Types/tournamentTypes';
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { CHECK_IN, CHECK_OUT } from '@Constants/timeItemConstants';
import type { PresenceAttestation } from '@Types/presenceTypes';
import { CHECKED_IN } from '@Constants/presenceConstants';
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

type AddMatchUpPresenceAttestationArgs = {
  attestation: PresenceAttestation;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  disableNotice?: boolean;
  matchUpId: string;
  event?: Event;
};
/**
 * The presence-log counterpart to {@link addMatchUpTimeItem}, and it exists for the same reason that
 * one does: the matchUp must be retrieved **without context** so the original is the thing modified.
 * A hydrated in-context matchUp is a copy, and writing the attestation to it would return success and
 * persist nothing.
 */
export function addMatchUpPresenceAttestation({
  tournamentRecord,
  drawDefinition,
  disableNotice,
  attestation,
  matchUpId,
  event,
}: AddMatchUpPresenceAttestationArgs) {
  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };

  const result = appendFirstClassOrTimeItem({
    legacy: { itemType: attestation.state === CHECKED_IN ? CHECK_IN : CHECK_OUT, itemValue: attestation.participantId },
    promoted: getMatchUpPresence(matchUp),
    legacyItemTypes: [CHECK_IN, CHECK_OUT],
    attribute: 'checkIns',
    element: matchUp,
    attestation,
  });
  if (result.error) return result;

  if (!disableNotice) {
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      context: 'addPresenceAttestation',
      eventId: event?.eventId,
      drawDefinition,
      matchUp,
      event,
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
