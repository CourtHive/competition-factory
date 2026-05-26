import { setFirstClassOrExtension } from '../../extensions/setFirstClassOrExtension';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

import { DELEGATED_OUTCOME } from '@Constants/extensionConstants';
import {
  INVALID_VALUES,
  MISSING_DRAW_DEFINITION,
  MISSING_MATCHUP,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

export function setDelegatedOutcome({ drawDefinition, matchUpId, outcome, matchUp }) {
  if (!matchUp && !drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!outcome) return { error: MISSING_VALUE, info: 'missing outcome' };
  if (!matchUp && !matchUpId) return { error: MISSING_MATCHUP };

  if (!matchUp) {
    const result = findDrawMatchUp({
      drawDefinition,
      matchUpId,
    });
    if (result.error) return result;
    matchUp = result.matchUp;
  }

  if (typeof outcome !== 'object' || !outcome.score?.scoreStringSide1 || !outcome.score?.scoreStringSide2) {
    return { error: INVALID_VALUES };
  }

  return setFirstClassOrExtension({
    element: matchUp,
    attribute: 'delegatedOutcome',
    name: DELEGATED_OUTCOME,
    value: outcome,
  });
}
