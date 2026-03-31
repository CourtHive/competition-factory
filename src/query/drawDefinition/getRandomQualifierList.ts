import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { DrawDefinition } from '@Types/tournamentTypes';
import { generateRange } from '@Tools/arrays';

// Constants
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

   
  const rng = random ?? Math.random;
  return generateRange(0, qualifierPositions.length).sort(() => rng() - 0.5);
};
