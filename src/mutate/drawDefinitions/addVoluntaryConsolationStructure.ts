import structureTemplate from '@Assemblies/generators/templates/structureTemplate';
import { modifyDrawNotice } from '../notifications/drawNotifications';
import { constantToString } from '@Tools/strings';

// Constants and types
import { MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type AddVoluntaryConsolationStructureArgs = {
  structureAbbreviation?: string;
  drawDefinition: DrawDefinition;
  structureName?: string;
  matchUpType?: string;
  structureId?: string;
};

export function addVoluntaryConsolationStructure({
  structureName = constantToString(VOLUNTARY_CONSOLATION),
  structureAbbreviation,
  drawDefinition,
  matchUpType,
  structureId,
}: AddVoluntaryConsolationStructureArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const structure = structureTemplate({
    stage: VOLUNTARY_CONSOLATION,
    structureAbbreviation,
    structureName,
    matchUps: [],
    structureId,
    matchUpType,
  });

  drawDefinition.structures ??= [];
  drawDefinition.structures.push(structure);

  modifyDrawNotice({ drawDefinition, structureIds: [structure.structureId] });

  return { ...SUCCESS };
}
