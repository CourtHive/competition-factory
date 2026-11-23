import { setFirstClassOrExtension } from '@Mutate/extensions/setFirstClassOrExtension';
import { attributesSnapshot } from '@Mutate/drawDefinitions/announceDrawChange';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

// constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { DISABLE_AUTO_CALC } from '@Constants/extensionConstants';

type DisableTieAutoCalcArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  matchUpId: string;
  event?: Event;
};

export function disableTieAutoCalc({ tournamentRecord, drawDefinition, matchUpId, event }: DisableTieAutoCalcArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { matchUp } = findDrawMatchUp({
    drawDefinition,
    matchUpId,
    event,
  });

  const attributes = ['disableAutoCalc'];
  const before = attributesSnapshot(matchUp, attributes);
  const result = setFirstClassOrExtension({
    element: matchUp,
    attribute: 'disableAutoCalc',
    name: DISABLE_AUTO_CALC,
    value: true,
  });

  // already disabled is a write that changes nothing, and announces nothing
  if (matchUp && !result.error && attributesSnapshot(matchUp, attributes) !== before) {
    modifyMatchUpNotice({ tournamentId: tournamentRecord?.tournamentId, drawDefinition, matchUp, event });
  }

  return result;
}
