import { setFirstClassOrExtension } from '../setFirstClassOrExtension';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DISABLE_AUTO_CALC } from '@Constants/extensionConstants';

export function disableTieAutoCalc({ drawDefinition, matchUpId, event }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const { matchUp } = findDrawMatchUp({
    drawDefinition,
    matchUpId,
    event,
  });

  return setFirstClassOrExtension({
    element: matchUp,
    attribute: 'disableAutoCalc',
    name: DISABLE_AUTO_CALC,
    value: true,
  });
}
