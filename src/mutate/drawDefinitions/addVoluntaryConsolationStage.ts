// Mutate
import { modifyDrawNotice } from '../notifications/drawNotifications';

// Constants
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function addVoluntaryConsolationStage({ drawDefinition }) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  // VC stage structure is created by generateVoluntaryConsolation;
  // this function signals intent and notifies observers
  modifyDrawNotice({ drawDefinition });

  return { ...SUCCESS };
}
