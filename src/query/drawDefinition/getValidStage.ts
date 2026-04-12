// Query
import { stageExists } from './stageGetter';

// Constants
import { VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';

export function getValidStage({ stage, drawDefinition }) {
  return Boolean(stage === VOLUNTARY_CONSOLATION || stageExists({ stage, drawDefinition }));
}
