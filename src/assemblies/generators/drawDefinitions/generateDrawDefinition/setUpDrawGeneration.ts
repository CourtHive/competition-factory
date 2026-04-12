import { newDrawDefinition } from '@Generators/drawDefinitions/newDrawDefinition';
import { checkFormatScopeEquivalence } from './checkFormatScopeEquivalence';
import { decorateResult } from '@Functions/global/decorateResult';
import { policyAttachment } from './drawDefinitionPolicyAttachment';

// constants and types
import { DrawDefinition, DrawTypeUnion } from '@Types/tournamentTypes';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { ResultType } from '@Types/factoryTypes';

export function setUpDrawGeneration(params): ResultType & {
  existingQualifyingPlaceholderStructureId?: string | boolean;
  existingDrawDefinition?: DrawDefinition;
  drawDefinition?: DrawDefinition;
  structureId?: string;
} {
  const {
    tournamentRecord,
    policyDefinitions,
    appliedPolicies,
    matchUpFormat,
    matchUpType,
    tieFormat,
    drawType,
    stack,
    event,
  } = params;

  const existingDrawDefinition = params.drawId
    ? (event?.drawDefinitions?.find((d) => d.drawId === params.drawId) as DrawDefinition)
    : undefined;

  // find existing MAIN structureId if existingDrawDefinition
  const structureId = existingDrawDefinition?.structures?.find(
    (structure) => structure.stage === MAIN && structure.stageSequence === 1,
  )?.structureId;

  const existingQualifyingStructures = existingDrawDefinition
    ? existingDrawDefinition.structures?.filter((structure) => structure.stage === QUALIFYING)
    : [];
  const existingQualifyingPlaceholderStructureId =
    existingQualifyingStructures?.length === 1 &&
    !existingQualifyingStructures[0].matchUps?.length &&
    existingQualifyingStructures[0].structureId;

  // Only overwrite drawType when not just adding qualifying to an existing draw
  if (existingDrawDefinition && drawType !== existingDrawDefinition.drawType && !existingQualifyingPlaceholderStructureId)
    existingDrawDefinition.drawType = drawType as DrawTypeUnion;

  const drawDefinition: any =
    existingDrawDefinition ??
    newDrawDefinition({
      processCodes: params.processCodes,
      drawId: params.drawId,
      drawType,
    });

  const equivalenceResult = checkFormatScopeEquivalence({
    existingQualifyingStructures,
    tournamentRecord,
    drawDefinition,
    matchUpFormat,
    matchUpType,
    tieFormat,
    event,
  });
  if (equivalenceResult.error) return decorateResult({ result: equivalenceResult, stack });

  const attachmentResult = policyAttachment({ appliedPolicies, policyDefinitions, drawDefinition, stack });
  if (attachmentResult.error) return attachmentResult;

  return { drawDefinition, structureId, existingDrawDefinition, existingQualifyingPlaceholderStructureId };
}
