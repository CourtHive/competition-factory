import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { attributesSnapshot } from '@Mutate/drawDefinitions/announceDrawChange';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { requireParams } from '@Helpers/parameters/requireParams';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants and types
import { DRAW_DEFINITION, MATCHUP_ID } from '@Constants/attributeConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DELEGATED_OUTCOME } from '@Constants/extensionConstants';

type RemoveDelegatedOutcomeArgs = {
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  disableNotice?: boolean;
  matchUpId?: string;
  event?: Event;
};

export function removeDelegatedOutcome({
  drawDefinition,
  tournamentRecord,
  disableNotice,
  matchUpId,
  event,
}: RemoveDelegatedOutcomeArgs) {
  const paramsCheck = requireParams({ drawDefinition, matchUpId }, [DRAW_DEFINITION, MATCHUP_ID]);
  // requireParams has refused a missing one; the check narrows them for the compiler
  if (paramsCheck.error || !drawDefinition || !matchUpId) return paramsCheck;

  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };

  // both surfaces the outcome can live on: the attribute and its legacy extension
  const before = attributesSnapshot(matchUp, ['delegatedOutcome']);
  const result = setFirstClassOrExtension({
    element: matchUp,
    attribute: 'delegatedOutcome',
    name: DELEGATED_OUTCOME,
    value: undefined,
  });
  if (result.error) return result;

  // MODIFY_MATCHUP, as setDelegatedOutcome sends; a matchUp with no delegated outcome sends nothing
  if (!disableNotice && attributesSnapshot(matchUp, ['delegatedOutcome']) !== before) {
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: event?.eventId,
      drawDefinition,
      matchUp,
      event,
    });
  }

  return result;
}
