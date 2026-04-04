import { setStageDrawSize, setStageQualifiersCount } from '@Mutate/drawDefinitions/entryGovernor/stageEntryCounts';
import { generateQualifyingStructures } from '@Generators/drawDefinitions/drawTypes/generateQualifyingStructures';
import { generateQualifyingLink } from '@Generators/drawDefinitions/links/generateQualifyingLink';
import { addDrawEntry } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { getQualifiersCount } from '@Query/drawDefinition/getQualifiersCount';

// constants and types
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { ResultType } from '@Types/factoryTypes';

export function processExistingDrawDefinition(params): ResultType & {
  structureId?: string;
  drawDefinition?: any;
} {
  const drawDefinition = params.drawDefinition;
  const {
    existingQualifyingPlaceholderStructureId,
    appliedPolicies,
    qualifyingOnly,
    drawEntries,
    structureId,
    tieFormat,
    idPrefix,
    isMock,
    event,
  } = params;

  const qualifyingProfiles = params.qualifyingProfiles;
  const qualifyingResult = qualifyingProfiles?.length
    ? generateQualifyingStructures({
        hasExistingDrawDefinition: true,
        uuids: params.uuids,
        qualifyingProfiles,
        appliedPolicies,
        qualifyingOnly,
        tieFormat,
        idPrefix,
        isMock,
      })
    : undefined;

  if (qualifyingResult?.error) {
    return qualifyingResult;
  }

  drawDefinition.structures = drawDefinition.structures?.filter(
    ({ structureId }) => structureId !== existingQualifyingPlaceholderStructureId,
  );
  drawDefinition.links = drawDefinition.links?.filter(
    ({ source }) => source.structureId !== existingQualifyingPlaceholderStructureId,
  );

  const { qualifiersCount, qualifyingDrawPositionsCount, qualifyingDetails } = qualifyingResult ?? {};

  if (qualifyingDrawPositionsCount) {
    if (qualifyingResult?.structures) {
      drawDefinition.structures?.push(...qualifyingResult.structures);
    }
    if (qualifyingResult?.links) {
      drawDefinition.links?.push(...qualifyingResult.links);
    }
  }

  const mainStructure = drawDefinition.structures?.find(
    ({ stage, stageSequence }) => stage === MAIN && stageSequence === 1,
  );
  const { qualifiersCount: existingQualifiersCount } = getQualifiersCount({
    stageSequence: 1,
    drawDefinition,
    structureId,
    stage: MAIN,
  });

  const derivedQualifiersCount = Math.max(qualifiersCount ?? 0, existingQualifiersCount ?? 0);

  let result = setStageQualifiersCount({
    qualifiersCount: derivedQualifiersCount,
    drawDefinition,
    stage: MAIN,
  });
  if (result.error) return result;

  result = setStageDrawSize({
    drawSize: qualifyingDrawPositionsCount,
    stage: QUALIFYING,
    drawDefinition,
  });
  if (result.error) return result;

  addEntries({ drawDefinition, drawEntries, event });
  const qResult = processQualifyingDetails({ mainStructure, qualifyingDetails, drawDefinition });
  if (qResult.error) return qResult;

  return { drawDefinition, structureId };
}

function addEntries({ drawDefinition, drawEntries, event }) {
  for (const entry of (drawEntries ?? []).filter(({ entryStage }) => entryStage === QUALIFYING)) {
    const entryData = {
      ...entry,
      entryStage: entry.entryStage ?? MAIN,
      drawDefinition,
      event,
    };
    // ignore errors (EXITING_PARTICIPANT)
    addDrawEntry(entryData);
  }
}

function processQualifyingDetails({ mainStructure, qualifyingDetails, drawDefinition }): ResultType {
  for (const qualifyingDetail of qualifyingDetails ?? []) {
    const {
      finalQualifyingRoundNumber: qualifyingRoundNumber,
      finalQualifyingStructureId: qualifyingStructureId,
      roundTarget: targetEntryRound,
      finishingPositions,
      linkType,
    } = qualifyingDetail;

    const link =
      mainStructure &&
      generateQualifyingLink({
        targetStructureId: mainStructure.structureId,
        sourceStructureId: qualifyingStructureId,
        sourceRoundNumber: qualifyingRoundNumber,
        finishingPositions,
        targetEntryRound,
        linkType,
      })?.link;
    if (link?.error) return link;

    if (link) {
      drawDefinition.links ??= [];
      drawDefinition.links.push(link);
    }
  }

  return { error: undefined };
}
