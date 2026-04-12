import { initializeStructureSeedAssignments } from '@Mutate/drawDefinitions/positionGovernor/initializeSeedAssignments';
import { automatedPositioning } from '@Mutate/drawDefinitions/automatedPositioning';
import { assignSeed } from '@Mutate/drawDefinitions/entryGovernor/seedAssignment';
import { getValidSeedBlocks } from '@Query/drawDefinition/seedGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { getScaledEntries } from '@Query/event/getScaledEntries';
import { getParticipantId } from '@Functions/global/extractors';
import { isAdHocType } from '@Query/drawDefinition/isAdHocType';
import { getDrawStructures } from '@Acquire/findStructure';
import { findExtension } from '@Acquire/findExtension';

// constants and types
import { STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { Entry, PositionAssignment } from '@Types/tournamentTypes';
import { QUALIFYING } from '@Constants/drawDefinitionConstants';
import { RANKING, SEEDING } from '@Constants/scaleConstants';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import { ResultType } from '@Types/factoryTypes';

export function prepareStage(params): ResultType & {
  positionAssignments?: PositionAssignment[];
  positioningReport?: any;
  stageEntries?: Entry[];
  structureId?: string;
  seedsCount?: number;
  conflicts?: any[];
} {
  const stack = 'prepareStage';

  const { drawDefinition } = params;
  const { structures } = getDrawStructures({
    stageSequence: params.stageSequence || 1,
    roundTarget: params.roundTarget,
    stage: params.stage,
    drawDefinition,
  });

  const preparedStructureIds: string[] = params.preparedStructureIds ?? [];
  const structure = structures?.find(({ structureId }) => !preparedStructureIds.includes(structureId));
  if (!structure) return decorateResult({ result: { error: STRUCTURE_NOT_FOUND }, stack });
  const structureId = structure?.structureId;

  const { seedsCount, stageEntries, seedLimit } = getSeedsCountAndStageEntries({ ...params, structureId });
  if (params.seededParticipants || params.event || params.seedingScaleName) {
    seeding({ ...params, seedsCount, structure, structureId });
  }

  const doPositioning =
    params.automated !== false &&
    !isAdHocType(params.drawType) &&
    !(params.qualifyingOnly && params.stage !== QUALIFYING);
  const multipleStructures = (structures?.length || 0) > 1;
  const positioningResult = doPositioning ? positioning({ ...params, multipleStructures, seedLimit, structureId }) : {};
  if (positioningResult?.error) return decorateResult({ result: positioningResult, stack });

  // For ad-hoc/Swiss draws where full positioning is skipped, still mark qualifier positions
  if (!doPositioning && isAdHocType(params.drawType) && structure?.positionAssignments?.length) {
    const qualifiersCount = params.qualifiersCount || 0;
    if (qualifiersCount > 0) {
      const unfilled = structure.positionAssignments.filter(
        (a) => !a.participantId && !a.qualifier && !a.bye,
      );
      for (let i = 0; i < qualifiersCount && i < unfilled.length; i++) {
        unfilled[i].qualifier = true;
      }
    }
  }

  return {
    ...positioningResult,
    stageEntries,
    structureId,
    seedsCount,
  };
}

function getStageEntries({ entries, stage, stageSequence, roundTarget }) {
  return entries.filter((entry) => {
    const entryRoundTarget = findExtension({
      name: ROUND_TARGET,
      element: entry,
    })?.extension?.value;

    return (
      (!entry.entryStage || entry.entryStage === stage) &&
      (!stageSequence || !entry.entryStageSequence || entry.entryStageSequence === stageSequence) &&
      (!roundTarget || !entryRoundTarget || entryRoundTarget === roundTarget) &&
      DIRECT_ENTRY_STATUSES.includes(entry.entryStatus)
    );
  });
}

function positioning(
  params,
): ResultType & { conflicts?: any[]; positionAssignments?: PositionAssignment[]; positioningReport?: any } {
  const seedsOnly = typeof params.automated === 'object' && params.automated.seedsOnly;
  // if { seedsOnly: true } then only seeds and an Byes releated to seeded positions are placed
  const result = automatedPositioning({ ...params, seedsOnly });
  if (result.error) return result;

  const positionAssignments = result?.positionAssignments;
  const positioningReport = result?.positioningReport;

  return { conflicts: result.conflicts, positionAssignments, positioningReport };
}

function seeding(params) {
  const { seededParticipants, seedingScaleName, entries, event } = params;
  const enteredParticipantIds = entries.map(getParticipantId);

  if (seededParticipants) {
    processSeededParticipants({ ...params, enteredParticipantIds });
  } else if (event || seedingScaleName) {
    // if no seededParticipants have been defined, seed by seeding scale or ranking scale, if present
    scaledEntriesSeeding({ ...params, enteredParticipantIds });
  }
}

function processSeededParticipants(params) {
  const {
    provisionalPositioning,
    enteredParticipantIds,
    seededParticipants,
    tournamentRecord,
    appliedPolicies,
    drawDefinition,
    seedingProfile,
    structureId,
    structure,
    event,
  } = params;

  const seedBlockInfo = structure
    ? getValidSeedBlocks({
        provisionalPositioning,
        appliedPolicies,
        drawDefinition,
        seedingProfile,
        structure,
      })
    : undefined;

  seededParticipants
    .filter(({ participantId }) => enteredParticipantIds.includes(participantId))
    .filter(
      (seededParticipant) => !seededParticipant.seedNumber || seededParticipant.seedNumber <= seededParticipants.length,
    )
    .sort((a, b) => {
      if (a.seedNumber < b.seedNumber) return -1;
      if (a.seedNumber < b.seedNumber) return 1;
      return 0;
    })
    .forEach((seededParticipant) => {
      const { participantId, seedNumber, seedValue } = seededParticipant;
      assignSeed({
        provisionalPositioning,
        tournamentRecord,
        drawDefinition,
        seedingProfile,
        participantId,
        seedBlockInfo,
        structureId,
        seedNumber,
        seedValue,
        event,
      });
    });
}

function scaledEntriesSeeding(params) {
  let seedsCount = params.seedsCount;
  const {
    provisionalPositioning,
    enteredParticipantIds,
    seedAssignmentProfile, // mainly used by mocksEngine for scenario testing
    assignSeedsCount, // used for testing bye placement next to seeds
    tournamentRecord,
    drawDefinition,
    seedByRanking,
    seedingProfile,
    structureId,
    event,
  } = params;

  const { categoryName, ageCategoryCode } = event?.category ?? {};
  const eventType = event?.eventType;

  const scaledEntries =
    getSeedingScaleEntries({ ...params, ageCategoryCode, categoryName, eventType }) ||
    (seedByRanking && getRankingScaleEntries({ ...params, ageCategoryCode, categoryName, eventType }));

  const scaledEntriesCount = scaledEntries?.length ?? 0;
  if (scaledEntriesCount < seedsCount) seedsCount = scaledEntriesCount;

  scaledEntries
    ?.filter(({ participantId }) => enteredParticipantIds.includes(participantId))
    .slice(0, assignSeedsCount || seedsCount)
    .forEach((scaledEntry, index) => {
      const seedNumber = index + 1;
      const { participantId, scaleValue } = scaledEntry;
      const seedValue = seedAssignmentProfile?.[seedNumber] || scaleValue || seedNumber;
      assignSeed({
        provisionalPositioning,
        tournamentRecord,
        drawDefinition,
        seedingProfile,
        participantId,
        structureId,
        seedNumber,
        seedValue,
        event,
      });
    });
}

function getSeedingScaleEntries(params) {
  const { tournamentRecord, seedingScaleName, stageSequence, entries, stage, event } = params;

  const { categoryName, ageCategoryCode } = event?.category ?? {};
  const eventType = event?.eventType;

  const seedingScaleAttributes = {
    scaleName: seedingScaleName || categoryName || ageCategoryCode || event.eventId,
    scaleType: SEEDING,
    eventType,
  };

  return getScaledEntries({
    scaleAttributes: seedingScaleAttributes,
    tournamentRecord,
    stageSequence,
    entries,
    stage,
  }).scaledEntries;
}

function getRankingScaleEntries(params) {
  const { tournamentRecord, stageSequence, event, entries, stage } = params;
  const { categoryName, ageCategoryCode } = event?.category ?? {};
  const eventType = event?.eventType;

  const rankingScaleAttributes = {
    scaleName: categoryName || ageCategoryCode,
    scaleType: RANKING,
    eventType,
  };

  return getScaledEntries({
    scaleAttributes: rankingScaleAttributes,
    tournamentRecord,
    stageSequence,
    entries,
    stage,
  }).scaledEntries;
}

function getSeedsCountAndStageEntries(params) {
  let { seedsCount } = params;
  if (params.seededParticipants) seedsCount = params.seededParticipants.length;
  if (seedsCount > params.drawSize) seedsCount = params.drawSize;

  const stageEntries = getStageEntries(params);
  if (seedsCount > stageEntries.length) seedsCount = stageEntries.length;

  const { seedLimit } = initializeStructureSeedAssignments({
    enforcePolicyLimits: params.enforcePolicyLimits ?? true,
    appliedPolicies: params.appliedPolicies,
    participantsCount: stageEntries.length,
    seedingProfile: params.seedingProfile,
    drawDefinition: params.drawDefinition,
    structureId: params.structureId,
    seedsCount,
  });

  if (seedLimit && seedLimit < seedsCount) seedsCount = seedLimit;

  return { seedsCount, stageEntries, seedLimit };
}
