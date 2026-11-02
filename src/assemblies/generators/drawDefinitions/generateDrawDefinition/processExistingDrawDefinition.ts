import { generateQualifyingStructures } from '@Generators/drawDefinitions/drawTypes/generateQualifyingStructures';
import { generateQualifyingLink } from '@Generators/drawDefinitions/links/generateQualifyingLink';
import { isSanctionLimitedStatus } from '@Query/drawDefinition/checkSanctionedEntryLimits';
import { addDrawEntry } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';

// constants and types
import type { DrawDefinition, Entry, Event, Tournament } from '@Types/tournamentTypes';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { ResultType } from '@Types/factoryTypes';

export function processExistingDrawDefinition(params): ResultType & {
  structureId?: string;
  drawDefinition?: DrawDefinition;
} {
  const drawDefinition: DrawDefinition = params.drawDefinition;
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
  const surviving = new Set((drawDefinition.structures ?? []).map((s) => s.structureId));
  drawDefinition.links = drawDefinition.links?.filter(
    ({ source }) =>
      source.structureId !== existingQualifyingPlaceholderStructureId && surviving.has(source.structureId),
  );

  const { qualifyingDrawPositionsCount, qualifyingDetails } = qualifyingResult ?? {};

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
  // Qualifier counts are derived from structures and links

  const entriesResult = addEntries({ tournamentRecord: params.tournamentRecord, drawDefinition, drawEntries, event });
  if (entriesResult.error) return entriesResult;
  const qResult = processQualifyingDetails({ mainStructure, qualifyingDetails, drawDefinition });
  if (qResult.error) return qResult;

  return { drawDefinition, structureId };
}

type AddEntriesArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  drawEntries?: Entry[];
  event?: Event;
};

function addEntries({ tournamentRecord, drawDefinition, drawEntries, event }: AddEntriesArgs): ResultType {
  for (const entry of (drawEntries ?? []).filter(({ entryStage }) => entryStage === QUALIFYING)) {
    // tournamentRecord and event resolve the sanctioning constraints addDrawEntry applies
    const entryData = {
      ...entry,
      entryStage: entry.entryStage ?? MAIN,
      tournamentRecord,
      drawDefinition,
      event,
    };
    // other errors are ignored (EXISTING_PARTICIPANT), except for an entry whose status the sanction bounds, which
    // is never dropped: generateOrGetExisting refuses entries over the sanctioned limits before generating, so this
    // is a backstop
    const result = addDrawEntry(entryData);
    if (result.error && isSanctionLimitedStatus({ tournamentRecord, entryStatus: entry.entryStatus, event }))
      return result;
  }
  return { error: undefined };
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
