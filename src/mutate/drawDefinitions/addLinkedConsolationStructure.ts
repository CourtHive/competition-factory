import { getGenerators } from '@Assemblies/generators/drawDefinitions/getGenerators';
import { attachConsolationStructures } from './attachStructures';
import { findStructure } from '@Acquire/findStructure';
import { constantToString } from '@Tools/strings';

// Constants and types
import { MISSING_DRAW_DEFINITION, MISSING_STRUCTURE, UNRECOGNIZED_DRAW_TYPE } from '@Constants/errorConditionConstants';
import { CONSOLATION, LOSER, MAIN, AD_HOC, TOP_DOWN } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type LoserLinkDefinition = {
  sourceRoundNumber: number;
  targetRoundNumber: number;
};

type GenerateConsolationArgs = {
  structureName?: string;
  structureType?: string;
  matchUpFormat?: string;
  matchUpType?: string;
  drawSize?: number;
};

type AddLinkedConsolationStructureArgs = GenerateConsolationArgs & {
  drawDefinition: any;
  structureId?: string;
  links: LoserLinkDefinition[];
};

/**
 * Generate a consolation structure with matchUps using the factory's generator pipeline.
 * Returns { structures, links } without modifying any draw definition.
 * Use attachConsolationStructures to attach the result to a draw.
 */
export function generateConsolationStructure({
  structureName,
  structureType = AD_HOC,
  drawSize = 2,
  matchUpFormat,
  matchUpType,
}: GenerateConsolationArgs) {
  const generatorParams: any = {
    stage: CONSOLATION,
    stageSequence: 1,
    structureName: structureName || constantToString(CONSOLATION),
    drawSize,
    matchUpFormat,
    matchUpType,
  };

  const { generators, error } = getGenerators(generatorParams);
  if (error) return { error };

  const generator = generators[structureType];
  if (!generator) return { error: UNRECOGNIZED_DRAW_TYPE };

  const generatorResult = generator();
  if (generatorResult.error) return generatorResult;

  return { ...SUCCESS, structures: generatorResult.structures };
}

/**
 * Generate a consolation structure and attach it to a draw with LOSER links.
 * This is a convenience mutation that combines generateConsolationStructure + attachConsolationStructures.
 */
export function addLinkedConsolationStructure({
  drawDefinition,
  structureId: mainStructureId,
  structureName,
  structureType = AD_HOC,
  drawSize = 2,
  matchUpFormat,
  matchUpType,
  links: linkDefs = [],
}: AddLinkedConsolationStructureArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  if (!mainStructureId) {
    mainStructureId = drawDefinition.structures?.find((s: any) => s.stage === MAIN)?.structureId;
  }
  if (!mainStructureId) return { error: MISSING_STRUCTURE };

  const { structure: mainStructure } = findStructure({ drawDefinition, structureId: mainStructureId });
  if (!mainStructure) return { error: MISSING_STRUCTURE };

  const result = generateConsolationStructure({
    structureName,
    structureType,
    drawSize,
    matchUpFormat,
    matchUpType: matchUpType || drawDefinition.matchUpType,
  });
  if (result.error) return result;

  const consolationStructure = result.structures?.[0];
  if (!consolationStructure) return { error: UNRECOGNIZED_DRAW_TYPE };

  const drawLinks = linkDefs.map((linkDef) => ({
    linkType: LOSER,
    source: {
      roundNumber: linkDef.sourceRoundNumber,
      structureId: mainStructureId,
    },
    target: {
      roundNumber: linkDef.targetRoundNumber,
      feedProfile: TOP_DOWN,
      structureId: consolationStructure.structureId,
    },
  }));

  return attachConsolationStructures({
    drawDefinition,
    structures: [consolationStructure],
    links: drawLinks,
  });
}
