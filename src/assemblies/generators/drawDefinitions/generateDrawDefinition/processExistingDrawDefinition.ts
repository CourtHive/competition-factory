import { generateQualifyingStructures } from '@Generators/drawDefinitions/drawTypes/generateQualifyingStructures';
import { generateQualifyingLink } from '@Generators/drawDefinitions/links/generateQualifyingLink';
import { getStageDrawPositionsBreakdown } from '@Query/drawDefinition/getStageDrawPositions';
import { isSanctionLimitedStatus } from '@Query/drawDefinition/checkSanctionedEntryLimits';
import { addDrawEntry } from '@Mutate/drawDefinitions/entryGovernor/addDrawEntries';
import { getStagePlaceTakingEntriesCount } from '@Query/drawDefinition/stageGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { entryNotPlaced } from './entriesNotPlaced';

// constants and types
import {
  INSUFFICIENT_DRAW_POSITIONS,
  NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS,
} from '@Constants/errorConditionConstants';
import type { DrawDefinition, Entry, Event, Structure, Tournament } from '@Types/tournamentTypes';
import { DIRECT_ACCEPTANCE, WITHDRAWN } from '@Constants/entryStatusConstants';
import { MAIN, QUALIFYING } from '@Constants/drawDefinitionConstants';
import { EntryNotPlaced, ResultType } from '@Types/factoryTypes';

export function processExistingDrawDefinition(params): ResultType & {
  entriesNotPlaced?: EntryNotPlaced[];
  structureId?: string;
  drawDefinition?: DrawDefinition;
} {
  const drawDefinition: DrawDefinition = params.drawDefinition;
  const {
    existingQualifyingPlaceholderStructureId,
    ignoreStageSpace,
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

  // explicit QUALIFYING drawEntries must fit the qualifying structures: refused before anything is written (CA 2026-11-01)
  const fitResult = checkQualifyingEntriesFit({
    existingQualifyingPlaceholderStructureId,
    qualifyingStructures: qualifyingResult?.structures,
    ignoreStageSpace,
    drawDefinition,
    drawEntries,
  });
  if (fitResult.error) return fitResult;

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

  return { drawDefinition, structureId, entriesNotPlaced: entriesResult.entriesNotPlaced };
}

type AddEntriesArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  drawEntries?: Entry[];
  event?: Event;
};

function addEntries({ tournamentRecord, drawDefinition, drawEntries, event }: AddEntriesArgs): ResultType & {
  entriesNotPlaced?: EntryNotPlaced[];
} {
  // QUALIFYING entries left out for want of a place: reported as an ENTRIES_NOT_PLACED warning
  const entriesNotPlaced: EntryNotPlaced[] = [];
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

    const notPlaced = entryNotPlaced({ entry: entryData, result });
    if (notPlaced) entriesNotPlaced.push(notPlaced);
  }
  return { error: undefined, entriesNotPlaced };
}

type CheckQualifyingEntriesFitArgs = {
  existingQualifyingPlaceholderStructureId?: string;
  qualifyingStructures?: Structure[];
  drawDefinition: DrawDefinition;
  ignoreStageSpace?: boolean;
  drawEntries?: Entry[];
};

/**
 * Explicit QUALIFYING drawEntries are the entries the caller chose: they are never trimmed to fit. A new qualifying
 * draw refuses entries that overfill it, so adding qualifying to an existing draw refuses them too, with the same
 * error: NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS, or INSUFFICIENT_DRAW_POSITIONS with `ignoreStageSpace` (which
 * skips the per-entry stage-space check, and leaves the draw positions to refuse what does not fit).
 *
 * The places are counted as addDrawEntry's stage space counts them: the qualifying structures' draw positions less
 * any qualifier positions, against every place-taking QUALIFYING entry the draw would hold. Generation from the
 * event's entries (no drawEntries) is not checked here.
 */
function checkQualifyingEntriesFit(params: CheckQualifyingEntriesFitArgs): ResultType {
  const { existingQualifyingPlaceholderStructureId, qualifyingStructures, ignoreStageSpace, drawDefinition } = params;
  const qualifyingDrawEntries = (params.drawEntries ?? []).filter(
    ({ entryStage, entryStatus }) => entryStage === QUALIFYING && entryStatus !== WITHDRAWN,
  );
  if (!qualifyingDrawEntries.length) return {};

  // the draw as it would be: the placeholder replaced by the generated qualifying structures
  const structures = [
    ...(drawDefinition.structures ?? []).filter(
      ({ structureId }) => structureId !== existingQualifyingPlaceholderStructureId,
    ),
    ...(qualifyingStructures ?? []),
  ];
  const prospectiveDrawDefinition = { ...drawDefinition, structures };
  const { positionsAvailable, drawPositions } = getStageDrawPositionsBreakdown({
    drawDefinition: prospectiveDrawDefinition,
    stage: QUALIFYING,
  });
  if (!drawPositions) return {};

  // entries already on the draw keep their places; a drawEntry for the same participant is not added twice
  const existingEntries = drawDefinition.entries ?? [];
  const existingIds = new Set(existingEntries.map(({ participantId }) => participantId));
  const entries = [
    ...existingEntries,
    ...qualifyingDrawEntries.filter(({ participantId }) => !existingIds.has(participantId)),
  ].map((entry) => ({ ...entry, entryStatus: entry.entryStatus ?? DIRECT_ACCEPTANCE }));
  const entriesCount = getStagePlaceTakingEntriesCount({ stage: QUALIFYING, entries });

  if (entriesCount <= positionsAvailable) return {};
  return decorateResult({
    result: { error: ignoreStageSpace ? INSUFFICIENT_DRAW_POSITIONS : NO_STAGE_SPACE_AVAILABLE_FOR_ENTRY_STATUS },
    context: { stage: QUALIFYING, entriesCount, drawPositionsCount: positionsAvailable },
    stack: 'processExistingDrawDefinition',
  });
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
