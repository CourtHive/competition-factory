import { setFirstClassOrExtension } from '../setFirstClassOrExtension';
import { requireParams } from '@Helpers/parameters/requireParams';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';

import { DRAW_DEFINITION, MATCHUP_ID } from '@Constants/attributeConstants';
import { MATCHUP_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DELEGATED_OUTCOME } from '@Constants/extensionConstants';

export function removeDelegatedOutcome({ drawDefinition, event, matchUpId }) {
  const paramsCheck = requireParams({ drawDefinition, matchUpId }, [DRAW_DEFINITION, MATCHUP_ID]);
  if (paramsCheck.error) return paramsCheck;

  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  if (!matchUp) return { error: MATCHUP_NOT_FOUND };

  return setFirstClassOrExtension({
    element: matchUp,
    attribute: 'delegatedOutcome',
    name: DELEGATED_OUTCOME,
    value: undefined,
  });
}
