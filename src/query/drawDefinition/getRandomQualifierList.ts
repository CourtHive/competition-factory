import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { decorateResult } from '@Functions/global/decorateResult';
import { generateRange, shuffleArray } from '@Tools/arrays';
import { DrawDefinition } from '@Types/tournamentTypes';

// constants
import { MISSING_MAIN_STRUCTURE } from '@Constants/errorConditionConstants';
import { DRAW_DEFINITION } from '@Constants/attributeConstants';
import { MAIN } from '@Constants/drawDefinitionConstants';

interface GetRandomQualifierListParams {
  drawDefinition: DrawDefinition;
  random?: () => number;
}

export const getRandomQualifierList = ({ drawDefinition, random }: GetRandomQualifierListParams) => {
  const paramsCheck = checkRequiredParameters({ drawDefinition }, [{ [DRAW_DEFINITION]: true }]);

  if (paramsCheck.error) return paramsCheck;

  const mainStructure = drawDefinition.structures?.find(
    (structure) => structure.stage === MAIN && structure.stageSequence === 1,
  );

  if (!mainStructure) return decorateResult({ result: { error: MISSING_MAIN_STRUCTURE } });

  const {
    qualifierPositions,
  }: {
    qualifierPositions: { drawPosition: number; qualifier: boolean }[];
  } = structureAssignedDrawPositions({ structure: mainStructure });

  return shuffleArray(generateRange(0, qualifierPositions.length), random);
};
