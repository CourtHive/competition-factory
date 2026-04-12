// Mutate
import { addExtension } from '@Mutate/extensions/addExtension';

// Constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { COMPETITION_STATE } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { DrawDefinition } from '@Types/tournamentTypes';
import type { ResultType } from '@Types/factoryTypes';

type ResetCompetitionStateArgs = {
  drawDefinition: DrawDefinition;
};

export function resetCompetitionState({ drawDefinition }: ResetCompetitionStateArgs): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  addExtension({
    element: drawDefinition,
    extension: { name: COMPETITION_STATE, value: undefined },
  });

  return { ...SUCCESS };
}
