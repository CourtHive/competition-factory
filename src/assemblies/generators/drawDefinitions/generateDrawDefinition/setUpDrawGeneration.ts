import { newDrawDefinition } from '@Generators/drawDefinitions/newDrawDefinition';
import { checkTieFormat } from '@Mutate/tieFormat/checkTieFormat';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
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
  const { tournamentRecord, policyDefinitions, appliedPolicies, matchUpFormat, matchUpType, drawType, stack, event } =
    params;
  let { tieFormat } = params;

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
  if (
    existingDrawDefinition &&
    drawType !== existingDrawDefinition.drawType &&
    !existingQualifyingPlaceholderStructureId
  )
    existingDrawDefinition.drawType = drawType as DrawTypeUnion;

  const drawDefinition: any =
    existingDrawDefinition ??
    newDrawDefinition({
      processCodes: params.processCodes,
      drawId: params.drawId,
      drawType,
    });

  // Normalize the incoming tieFormat ONCE, before anything consumes it: mint any missing collectionIds
  // on a copy, then put that copy back on params so every downstream step — the scope-equivalence
  // attachment here and the tie matchUp generation in generateDrawTypeAndModifyDrawDefinition — works
  // from the SAME identities. Minting independently in each step gave the drawDefinition one set of
  // collectionIds and the generated lines another, so the lines could not be attributed to their
  // collection and a completed dual stalled at IN_PROGRESS.
  if (tieFormat) {
    const collectionIdResult = checkTieFormat({ tieFormat: makeDeepCopy(tieFormat, false, true) });
    if (collectionIdResult.error) return decorateResult({ result: collectionIdResult, stack });
    tieFormat = collectionIdResult.tieFormat;
    params.tieFormat = tieFormat;
  }

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
