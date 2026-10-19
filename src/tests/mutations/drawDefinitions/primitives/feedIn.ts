import { getDrawStructures } from '@Acquire/findStructure';
import { matchUpsOf } from '@Acquire/structureMembers';

// constants and types
import { generateDrawTypeAndModifyDrawDefinition } from '@Assemblies/generators/drawDefinitions/generateDrawTypeAndModifyDrawDefinition';
import { newDrawDefinition } from '@Assemblies/generators/drawDefinitions/newDrawDefinition';
import { MAIN, CONSOLATION } from '@Constants/drawDefinitionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

export function feedInChampionship(params): ResultType & {
  consolationStructure?: any;
  consolationMatchUps?: any;
  mainDrawMatchUps?: any;
  drawDefinition?: DrawDefinition;
  links?: any;
} {
  const { drawSize, drawType, feedPolicy, drawTypeCoercion } = params;
  const drawDefinition: DrawDefinition = newDrawDefinition();
  const result = generateDrawTypeAndModifyDrawDefinition({
    drawTypeCoercion,
    drawDefinition,
    feedPolicy,
    drawSize,
    drawType,
  });
  if (result.error) return result;

  const { links } = result;
  const {
    structures: [mainStructure],
  } = getDrawStructures({ drawDefinition, stage: MAIN });
  const mainDrawMatchUps = matchUpsOf(mainStructure);
  const {
    structures: [consolationStructure],
  } = getDrawStructures({ drawDefinition, stage: CONSOLATION });
  const consolationMatchUps = matchUpsOf(consolationStructure);

  return {
    consolationStructure,
    consolationMatchUps,
    mainDrawMatchUps,
    drawDefinition,
    links,
  };
}
