import { initializeStructureSeedAssignments } from '@Mutate/drawDefinitions/positionGovernor/initializeSeedAssignments';
import { assignSeed } from '@Mutate/drawDefinitions/entryGovernor/seedAssignment';
import { getValidSeedBlocks } from '@Query/drawDefinition/seedGetter';
import { getScaledEntries } from '@Query/event/getScaledEntries';
import { getParticipantId } from '@Functions/global/extractors';
import { findExtension } from '@Acquire/findExtension';

// constants and types
import type { DrawDefinition, Entry, Event, StageTypeUnion, Structure, Tournament } from '@Types/tournamentTypes';
import type { PolicyDefinitions, SeedingProfile } from '@Types/factoryTypes';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import { RANKING, SEEDING } from '@Constants/scaleConstants';

// The seed count and seeding of one structure, from its stage entries: shared by draw generation and by the
// positioning of a structure generated before its entries (a shell), which is seeded when it is positioned.

export type SeededParticipant = { participantId: string; seedNumber: number; seedValue?: number | string };

export type StructureSeedingArgs = {
  seedAssignmentProfile?: Record<number, number | string>;
  seededParticipants?: SeededParticipant[];
  appliedPolicies?: PolicyDefinitions;
  provisionalPositioning?: boolean;
  enforcePolicyLimits?: boolean;
  seedingProfile?: SeedingProfile;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  seedingScaleName?: string;
  assignSeedsCount?: number;
  seedByRanking?: boolean;
  stageSequence?: number;
  structure?: Structure;
  roundTarget?: number;
  structureId: string;
  seedsCount?: number;
  drawSize?: number;
  entries: Entry[];
  stage?: StageTypeUnion;
  event?: Event;
};
type EnteredSeedingArgs = StructureSeedingArgs & { enteredParticipantIds: string[] };

function getStageEntries({ entries, stage, stageSequence, roundTarget }: StructureSeedingArgs) {
  return entries.filter((entry) => {
    const entryRoundTarget = findExtension({
      name: ROUND_TARGET,
      element: entry,
    })?.extension?.value;

    return (
      (!entry.entryStage || entry.entryStage === stage) &&
      (!stageSequence || !entry.entryStageSequence || entry.entryStageSequence === stageSequence) &&
      (!roundTarget || !entryRoundTarget || entryRoundTarget === roundTarget) &&
      !!entry.entryStatus &&
      DIRECT_ENTRY_STATUSES.includes(entry.entryStatus)
    );
  });
}

export function seeding(params: StructureSeedingArgs) {
  const { seededParticipants, seedingScaleName, entries, event } = params;
  const enteredParticipantIds = entries.map(getParticipantId);

  if (seededParticipants) {
    processSeededParticipants({ ...params, enteredParticipantIds });
  } else if (event || seedingScaleName) {
    // if no seededParticipants have been defined, seed by seeding scale or ranking scale, if present
    scaledEntriesSeeding({ ...params, enteredParticipantIds });
  }
}

function processSeededParticipants(params: EnteredSeedingArgs) {
  const {
    provisionalPositioning,
    enteredParticipantIds,
    seededParticipants = [],
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
    .sort((a, b) => (a.seedNumber < b.seedNumber ? -1 : 0))
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

function scaledEntriesSeeding(params: EnteredSeedingArgs) {
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

  // an event without seeding is seeded by ranking when asked; the seeding lookup finds [] then, not undefined
  const seedingEntries = getSeedingScaleEntries(params);
  const scaledEntries = !seedingEntries?.length && seedByRanking ? getRankingScaleEntries(params) : seedingEntries;

  const scaledEntriesCount = scaledEntries?.length ?? 0;
  if (seedsCount !== undefined && scaledEntriesCount < seedsCount) seedsCount = scaledEntriesCount;

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

function getSeedingScaleEntries(params: StructureSeedingArgs) {
  const { tournamentRecord, seedingScaleName, stageSequence, entries, stage, event } = params;
  if (!tournamentRecord) return undefined;

  const { categoryName, ageCategoryCode } = event?.category ?? {};
  const eventType = event?.eventType;

  const seedingScaleAttributes = {
    scaleName: seedingScaleName || categoryName || ageCategoryCode || event?.eventId,
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

function getRankingScaleEntries(params: StructureSeedingArgs) {
  const { tournamentRecord, stageSequence, event, entries, stage } = params;
  if (!tournamentRecord) return undefined;
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

export function getSeedsCountAndStageEntries(params: StructureSeedingArgs) {
  let { seedsCount } = params;
  if (params.seededParticipants) seedsCount = params.seededParticipants.length;
  if (seedsCount !== undefined && params.drawSize !== undefined && seedsCount > params.drawSize) {
    seedsCount = params.drawSize;
  }

  const stageEntries = getStageEntries(params);
  if (seedsCount !== undefined && seedsCount > stageEntries.length) seedsCount = stageEntries.length;

  const { seedLimit } = initializeStructureSeedAssignments({
    enforcePolicyLimits: params.enforcePolicyLimits ?? true,
    appliedPolicies: params.appliedPolicies,
    participantsCount: stageEntries.length,
    seedingProfile: params.seedingProfile,
    drawDefinition: params.drawDefinition,
    structureId: params.structureId,
    // undefined when no seeds were asked for; it is stored on the structure as is
    seedsCount: seedsCount as number,
  });

  if (seedLimit && seedsCount !== undefined && seedLimit < seedsCount) seedsCount = seedLimit;

  return { seedsCount, stageEntries, seedLimit };
}
