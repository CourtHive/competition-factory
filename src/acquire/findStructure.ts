import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { structureSort } from '@Functions/sorters/structureSort';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';

// constants and types
import { MISSING_STRUCTURES, STRUCTURE_NOT_FOUND, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { DRAW_DEFINITION, STRUCTURE_ID } from '@Constants/attributeConstants';
import { ITEM, validStages } from '@Constants/drawDefinitionConstants';
import { StructureSortConfig, ResultType } from '@Types/factoryTypes';
import { DrawDefinition, Structure } from '@Types/tournamentTypes';
import { ROUND_TARGET } from '@Constants/extensionConstants';

type FindStructureArgs = {
  drawDefinition?: DrawDefinition;
  structureId?: string;
};

type FoundStructureResult = {
  containingStructure?: Structure;
  structure?: Structure;
};

export function findStructure(params: FindStructureArgs): ResultType & FoundStructureResult {
  const paramsCheck = checkRequiredParameters(params, [{ [DRAW_DEFINITION]: true, [STRUCTURE_ID]: true }]);
  if (paramsCheck.error) return paramsCheck;

  const { drawDefinition, structureId } = params;

  const { structures } = getDrawStructures({ drawDefinition });
  const allStructures = structures?.flatMap((structure) => {
    return structure.structures ? [...structure.structures].concat(structure) : structure;
  });

  const structure = allStructures?.find((structure) => structure.structureId === structureId);

  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const containingStructure =
    structure.structureType === ITEM
      ? allStructures?.find((s) => s.structures?.some((s) => s.structureId === structureId))
      : undefined;

  return { structure, containingStructure };
}

type GetDrawStructuresArgs = {
  sortConfig?: StructureSortConfig;
  drawDefinition?: DrawDefinition;
  withStageGrouping?: boolean;
  stageSequences?: string[];
  stageSequence?: number;
  roundTarget?: number;
  stages?: string[];
  stage?: string;
};

type FoundDrawStructure = {
  stageStructures: { [key: string]: Structure[] };
  structures: Structure[];
};

export function getDrawStructures({
  withStageGrouping,
  drawDefinition,
  stageSequences,
  stageSequence,
  roundTarget,
  sortConfig,
  stages,
  stage,
}: GetDrawStructuresArgs): ResultType & FoundDrawStructure {
  const error =
    (!drawDefinition && MISSING_DRAW_DEFINITION) || (!drawDefinition?.structures && MISSING_STRUCTURES) || undefined;

  if (error) return { error, structures: [], stageStructures: {} };

  const isRoundTarget = (structure) => {
    const value = firstClassOrExtension({ element: structure, attribute: 'roundTarget', name: ROUND_TARGET });
    return !roundTarget || roundTarget === value;
  };

  const structures =
    drawDefinition?.structures
      ?.filter(isStage)
      .filter(isStageSequence)
      .filter(isRoundTarget)
      .sort((a, b) => structureSort(a, b, sortConfig)) ?? [];

  const stageStructures = withStageGrouping
    ? Object.assign(
        {},
        ...validStages
          .map((stage) => {
            const relevantStructures = structures?.filter((structure) => structure.stage === stage);
            return relevantStructures?.length && { [stage]: relevantStructures };
          })
          .filter(Boolean),
      )
    : {};

  return { structures, stageStructures };

  function isStage(structure) {
    return (
      (!stage && !Array.isArray(stages)) ||
      (stage && structure.stage === stage) ||
      (Array.isArray(stages) && stages.includes(structure.stage))
    );
  }
  function isStageSequence(structure) {
    return (
      (!stageSequence && !Array.isArray(stageSequences)) ||
      (stageSequence && structure.stageSequence === stageSequence) ||
      (Array.isArray(stageSequences) && stageSequences.includes(structure.stageSequence))
    );
  }
}
