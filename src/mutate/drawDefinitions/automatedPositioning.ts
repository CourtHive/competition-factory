import { getSeedsCountAndStageEntries, seeding, SeededParticipant } from '@Mutate/drawDefinitions/structureSeeding';
import { positionUnseededParticipants } from '@Mutate/matchUps/drawPositions/positionUnseededParticipants';
import { positionQualifiers, getQualifiersData } from '@Mutate/matchUps/drawPositions/positionQualifiers';
import { getSeedPattern, getValidSeedBlocks, SeedBlockInfo } from '@Query/drawDefinition/seedGetter';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { disableNotifications, enableNotifications } from '@Global/state/globalState';
import { positionSeedBlocks } from '@Mutate/matchUps/drawPositions/positionSeeds';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { positionByes } from './positionGovernor/byePositioning/positionByes';
import { getQualifiersCount } from '@Query/drawDefinition/getQualifiersCount';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { firstClassOrExtension } from '@Acquire/firstClassOrExtension';
import { getParticipants } from '@Query/participants/getParticipants';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { PolicyDefinitions, SeedBlock, SeedingProfile, MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { QUALIFYING, WATERFALL } from '@Constants/drawDefinitionConstants';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { HydratedMatchUp, HydratedParticipant } from '@Types/hydrated';
import { ROUND_TARGET } from '@Constants/extensionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS,
  INSUFFICIENT_DRAW_POSITIONS,
  STRUCTURE_NOT_FOUND,
} from '@Constants/errorConditionConstants';

import {
  DrawDefinition,
  Event,
  PositionAssignment,
  SeedAssignment,
  Structure,
  Tournament,
} from '@Types/tournamentTypes';

type AutomatedPositioningArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  seededParticipants?: SeededParticipant[];
  enforcePolicyLimits?: boolean;
  seedingScaleName?: string;
  seedByRanking?: boolean;
  seedsCount?: number;
  participants?: HydratedParticipant[];
  appliedPolicies?: PolicyDefinitions;
  provisionalPositioning?: boolean;
  seedingProfile?: SeedingProfile;
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  multipleStructures?: boolean;
  applyPositioning?: boolean;
  matchUpsMap?: MatchUpsMap;
  placementGroup?: number;
  random?: () => number;
  placeByes?: boolean;
  structureId: string;
  seedsOnly?: boolean;
  seedLimit?: number;
  drawType?: string;
  drawSize?: number;
  event?: Event;
};
type ByeAndSeedPositioningArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
  positioningReport: { [key: string]: unknown }[];
  structureSeedingProfile?: Structure['seedingProfile'];
  participants?: HydratedParticipant[];
  appliedPolicies?: PolicyDefinitions;
  provisionalPositioning?: boolean;
  seedingProfile?: SeedingProfile;
  validSeedBlocks?: SeedBlock[];
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  seedBlockInfo: SeedBlockInfo;
  matchUpsMap: MatchUpsMap;
  qualifiersCount: number;
  random?: () => number;
  structure: Structure;
  placeByes?: boolean;
  seedsOnly?: boolean;
  seedLimit?: number;
  drawType?: string;
  event?: Event;
};

// Helper functions to reduce complexity
function handleErrorCondition(result, applyPositioning) {
  if (!applyPositioning) enableNotifications();
  return decorateResult({ result, stack: 'automatedPositioning' });
}

function handleSuccessCondition(result, applyPositioning) {
  if (!applyPositioning) enableNotifications();
  return result;
}

function getInitialData(params, drawDefinition, structureId, event) {
  const result = findStructure({ drawDefinition, structureId });
  if (result.error) return { error: result.error };
  const structure = result.structure;
  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const appliedPolicies =
    params.appliedPolicies ||
    getAppliedPolicies({
      drawDefinition,
      structure,
      event,
    })?.appliedPolicies;

  const { qualifiersCount: derivedQualifiersCount } = getQualifiersCount({
    stageSequence: structure.stageSequence,
    provisionalPositioning: params.provisionalPositioning,
    stage: structure.stage,
    drawDefinition,
    structureId,
  });
  // Fall back to explicit qualifiersCount param (e.g., placeholder qualifying)
  const qualifiersCount = derivedQualifiersCount || params.qualifiersCount || 0;

  const entryStatuses = DIRECT_ENTRY_STATUSES;
  const entries = getStageEntries({
    stageSequence: structure.stageSequence,
    provisionalPositioning: params.provisionalPositioning,
    stage: structure.stage,
    placementGroup: params.placementGroup,
    drawDefinition,
    entryStatuses,
    structureId,
  });

  return { structure, appliedPolicies, qualifiersCount, entries };
}

function handleWaterfall({
  qualifiersCount,
  placeByes,
  provisionalPositioning,
  tournamentRecord,
  appliedPolicies,
  drawDefinition,
  seedBlockInfo,
  matchUpsMap,
  structure,
  seedLimit,
  seedsOnly,
  event,
  structureSeedingProfile,
  seedingProfile,
  inContextDrawMatchUps,
  participants,
  positioningReport,
  random,
}: ByeAndSeedPositioningArgs) {
  const byeResult = placeByes
    ? positionByes({
        provisionalPositioning,
        tournamentRecord,
        appliedPolicies,
        qualifiersCount,
        drawDefinition,
        seedBlockInfo,
        matchUpsMap,
        structure,
        seedLimit,
        seedsOnly,
        random,
        event,
      })
    : undefined;
  if (byeResult?.error) return { error: byeResult.error };
  const unseededByePositions = byeResult?.unseededByePositions;

  positioningReport.push({ action: 'positionByes', unseededByePositions });

  const profileSeeding = structureSeedingProfile ? { positioning: structureSeedingProfile } : seedingProfile;

  const seedResult = positionSeedBlocks({
    seedingProfile: profileSeeding,
    provisionalPositioning,
    inContextDrawMatchUps,
    tournamentRecord,
    appliedPolicies,
    validSeedBlocks: seedBlockInfo.validSeedBlocks,
    drawDefinition,
    seedBlockInfo,
    participants,
    matchUpsMap,
    structure,
    random,
    event,
  });
  if (seedResult.error) return { error: seedResult.error };

  positioningReport.push({
    seedPositions: seedResult.seedPositions,
    action: 'positionSeedBlocks',
  });

  return { unseededByePositions };
}

function handleNonWaterfall({
  qualifiersCount,
  drawType,
  structureSeedingProfile,
  seedingProfile,
  provisionalPositioning,
  inContextDrawMatchUps,
  tournamentRecord,
  appliedPolicies,
  validSeedBlocks,
  drawDefinition,
  seedBlockInfo,
  participants,
  matchUpsMap,
  structure,
  event,
  placeByes,
  seedLimit,
  seedsOnly,
  positioningReport,
  random,
}: ByeAndSeedPositioningArgs) {
  let unseededByePositions;
  if (!isLuckyBasedDraw(drawType)) {
    const profileSeeding = structureSeedingProfile ? { positioning: structureSeedingProfile } : seedingProfile;
    const result = positionSeedBlocks({
      seedingProfile: profileSeeding,
      provisionalPositioning,
      inContextDrawMatchUps,
      tournamentRecord,
      appliedPolicies,
      validSeedBlocks,
      drawDefinition,
      seedBlockInfo,
      participants,
      matchUpsMap,
      structure,
      random,
      event,
    });

    if (result.error) return { error: result.error };

    positioningReport.push({
      action: 'positionSeedBlocks',
      seedPositions: result.seedPositions,
    });
  }

  const result = placeByes
    ? positionByes({
        provisionalPositioning,
        tournamentRecord,
        appliedPolicies,
        qualifiersCount,
        drawDefinition,
        seedBlockInfo,
        matchUpsMap,
        structure,
        seedLimit,
        seedsOnly,
        random,
        event,
      })
    : undefined;

  if (result?.error) {
    return { error: result.error };
  }
  unseededByePositions = result?.unseededByePositions;
  positioningReport.push({
    action: 'positionByes',
    byeDrawPositions: result?.byeDrawPositions,
    unseededByePositions,
  });

  return { unseededByePositions };
}

function handleQualifiersAndUnseeded({
  seedsOnly,
  inContextDrawMatchUps,
  tournamentRecord,
  appliedPolicies,
  validSeedBlocks,
  drawDefinition,
  seedBlockInfo,
  participants,
  matchUpsMap,
  structure,
  positionQualifiers,
  positionUnseededParticipants,
  provisionalPositioning,
  unseededByePositions,
  multipleStructures,
  qualifiersCount,
  structureId,
  drawSize,
  event,
  positioningReport,
  conflicts,
  random,
}) {
  if (seedsOnly) return {};
  const qualifiersLast = qualifiersCanFollowUnseeded({
    provisionalPositioning,
    drawDefinition,
    qualifiersCount,
    structure,
  });

  const placeQualifiers = () => {
    const result = positionQualifiers({
      inContextDrawMatchUps,
      tournamentRecord,
      appliedPolicies,
      validSeedBlocks,
      drawDefinition,
      qualifiersCount,
      seedBlockInfo,
      participants,
      matchUpsMap,
      structure,
      random,
    });
    if (result.error) {
      return { error: result.error };
    }
    if (result.conflicts) conflicts.qualifierConflicts = result.conflicts;
    positioningReport.push({
      action: 'positionQualifiers',
      qualifierDrawPositions: result.qualifierDrawPositions,
    });

    return {};
  };

  const placeUnseeded = () => {
    const result = positionUnseededParticipants({
      provisionalPositioning,
      inContextDrawMatchUps,
      unseededByePositions,
      multipleStructures,
      tournamentRecord,
      drawDefinition,
      seedBlockInfo,
      participants,
      matchUpsMap,
      structureId,
      structure,
      randomizePositions: qualifiersLast,
      drawSize,
      random,
      event,
    });

    if (result.error) {
      return { error: result.error };
    }
    if (result.conflicts) conflicts.unseededConflicts = result.conflicts;
    positioningReport.push({ action: 'positionUnseededParticipants' });

    return {};
  };

  const steps = qualifiersLast ? [placeUnseeded, placeQualifiers] : [placeQualifiers, placeUnseeded];
  for (const step of steps) {
    const result = step();
    if (result.error) return result;
  }

  return {};
}

/** Anonymous first-round qualifiers occupy the space left by direct entrants. Later-round and feed-in
 * reservations retain their existing priority: unrestricted entrants could otherwise consume their only seats. */
function qualifiersCanFollowUnseeded(params: {
  provisionalPositioning?: boolean;
  drawDefinition: DrawDefinition;
  qualifiersCount?: number;
  structure: Structure;
}) {
  if (!params.qualifiersCount) return false;
  const { unplacedRoundQualifierCounts, positionAssignments, roundDrawPositions } = getQualifiersData(params);
  const pendingRounds = Object.entries(unplacedRoundQualifierCounts).filter(([, count]) => Number(count) > 0);
  if (pendingRounds.length !== 1 || pendingRounds[0][0] !== '1') return false;

  const available = positionAssignments.filter(
    (assignment) => !assignment.participantId && !assignment.qualifier && !assignment.bye,
  );
  const firstRoundPositions = new Set(roundDrawPositions[1] ?? []);
  if (!available.every(({ drawPosition }) => firstRoundPositions.has(drawPosition))) return false;

  const { structure, drawDefinition, provisionalPositioning } = params;
  const assignedIds = new Set(positionAssignments.map(({ participantId }) => participantId).filter(Boolean));
  const entries = getStageEntries({
    entryStatuses: DIRECT_ENTRY_STATUSES,
    stageSequence: structure.stageSequence,
    structureId: structure.structureId,
    stage: structure.stage,
    provisionalPositioning,
    drawDefinition,
  });
  const unplacedEntries = entries.filter(({ participantId }) => !assignedIds.has(participantId)).length;
  // Keep the original refusal path if entrants plus placeholders cannot fit; do not write entrants first.
  return unplacedEntries + Number(pendingRounds[0][1]) <= available.length;
}

/** A structure generated before its entries (a shell) has no seeds: with `seedsCount`, nobody yet positioned in it
 *  and no seeds of its own, it is seeded from the entries present now, within the seeding policy. */
function seedUnpositionedStructure(params: AutomatedPositioningArgs & { structure: Structure }) {
  const { drawDefinition, structure, seedsCount } = params;
  // seeds chosen when the structure was generated (Manual creation with entries) are kept
  if (seedsCount === undefined || structure.seedAssignments?.some(({ participantId }) => participantId)) return;
  const { positionAssignments = [] } = getPositionAssignments({ drawDefinition, structure });
  if (positionAssignments.some(({ participantId }) => participantId)) return;

  const seedingParams = {
    ...params,
    drawSize: positionAssignments.length,
    entries: drawDefinition.entries ?? [],
    stageSequence: structure.stageSequence,
    structureId: structure.structureId,
    stage: structure.stage,
  };
  const { seedsCount: structureSeedsCount } = getSeedsCountAndStageEntries(seedingParams);
  if (params.seededParticipants || params.event || params.seedingScaleName) {
    seeding({ ...seedingParams, seedsCount: structureSeedsCount });
  }
}

/**
 * The capacity refusals automated positioning would otherwise meet part-way, asked of the structure as
 * it stands. Both are necessary conditions — positioning only ever fills seats — so a structure this
 * passes is not refused for capacity by anything it does not also see.
 *
 * - `NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS`: the unplaced first-round qualifiers outnumber the
 *   open first-round seats (`positionQualifiers`).
 * - `INSUFFICIENT_DRAW_POSITIONS`: the unplaced unseeded entries and qualifiers together outnumber the
 *   open seats (`positionUnseededParticipants`, which waives it for `multipleStructures`).
 *
 * Not caught here, so still met part-way: seeds seated by `positionSeedBlocks` leaving too few seats for
 * the unseeded, and later-round qualifiers finding no BYE-advanced seat. Both depend on what this
 * positioning places first.
 */
function positioningCapacityRefusal(params: {
  provisionalPositioning?: boolean;
  multipleStructures?: boolean;
  drawDefinition: DrawDefinition;
  qualifiersCount?: number;
  structure: Structure;
  seedsOnly?: boolean;
}): ResultType | undefined {
  const { provisionalPositioning, multipleStructures, drawDefinition, qualifiersCount, structure, seedsOnly } = params;
  if (seedsOnly) return undefined;

  const { unplacedRoundQualifierCounts, positionAssignments, roundDrawPositions } = getQualifiersData({
    drawDefinition,
    qualifiersCount,
    structure,
  });
  const isOpen = (assignment) => !assignment.participantId && !assignment.qualifier && !assignment.bye;
  const openSeats = positionAssignments.filter(isOpen);

  // Only first-round qualifiers are asked: a later round's seats are those BYEs advance into it, and
  // the BYEs are placed by the positioning this precedes.
  const { 1: firstRoundSeats } = roundDrawPositions;
  const firstRoundOpenSeats = openSeats.filter(({ drawPosition }) => firstRoundSeats?.includes(drawPosition));
  if (firstRoundSeats && unplacedRoundQualifierCounts['1'] > firstRoundOpenSeats.length)
    return { error: NO_DRAW_POSITIONS_AVAILABLE_FOR_QUALIFIERS };

  if (multipleStructures) return undefined;

  // the entries positionUnseededParticipants seats
  const { stage, stageSequence } = structure;
  const roundTarget =
    stage === QUALIFYING
      ? firstClassOrExtension({ element: structure, attribute: 'roundTarget', name: ROUND_TARGET })
      : undefined;
  const entries = getStageEntries({
    entryStatuses: DIRECT_ENTRY_STATUSES,
    structureId: structure.structureId,
    provisionalPositioning,
    drawDefinition,
    stageSequence,
    roundTarget,
    stage,
  });
  // the unseeded entries, as positionUnseededParticipants counts them: seeds are seated by positionSeedBlocks
  // first and only ever reduce the seats left, so leaving them out keeps this a necessary condition
  const seeded = new Set(
    (getStructureSeedAssignments({ provisionalPositioning, drawDefinition, structure }).seedAssignments ?? []).map(
      ({ participantId }) => participantId,
    ),
  );
  const placedParticipantIds = new Set(positionAssignments.map(({ participantId }) => participantId).filter(Boolean));
  const unplacedEntries = entries.filter(
    ({ participantId }) => !placedParticipantIds.has(participantId) && !seeded.has(participantId),
  ).length;
  const unplacedQualifiers = Object.values(unplacedRoundQualifierCounts).reduce(
    (total: number, count) => total + Math.max(0, Number(count)),
    0,
  );

  if (unplacedEntries + unplacedQualifiers > openSeats.length) return { error: INSUFFICIENT_DRAW_POSITIONS };
  return undefined;
}

export function automatedPositioning(params: AutomatedPositioningArgs): ResultType & {
  positionAssignments?: PositionAssignment[];
  seedAssignments?: SeedAssignment[];
  positioningReport?: { [key: string]: any }[];
  success?: boolean;
  conflicts?: any[];
} {
  let { drawDefinition } = params;
  const {
    applyPositioning = true,
    provisionalPositioning,
    multipleStructures,
    placeByes = true,
    tournamentRecord,
    seedingProfile,
    structureId,
    seedLimit,
    seedsOnly,
    drawType,
    drawSize,
    random,
    event,
  } = params;

  const positioningReport: { [key: string]: unknown }[] = [];

  if (!applyPositioning) {
    disableNotifications();
    drawDefinition = makeDeepCopy(drawDefinition, false, true);
  }

  const {
    structure,
    appliedPolicies,
    qualifiersCount,
    entries,
    error: initialError,
  } = getInitialData(params, drawDefinition, structureId, event);
  if (initialError) return handleErrorCondition({ error: initialError }, applyPositioning);

  if (!entries?.length && !qualifiersCount) return handleSuccessCondition({ ...SUCCESS }, applyPositioning);

  // Seeds, BYEs and qualifiers are placed before the unseeded entries; a structure that cannot hold
  // everyone is refused BEFORE any of them is written, not after.
  const capacityRefusal = positioningCapacityRefusal({ ...params, drawDefinition, structure, qualifiersCount });
  if (capacityRefusal) return handleErrorCondition(capacityRefusal, applyPositioning);

  seedUnpositionedStructure({ ...params, appliedPolicies, drawDefinition, structure });

  const matchUpsMap = params.matchUpsMap ?? getMatchUpsMap({ drawDefinition });

  const inContextDrawMatchUps =
    params.inContextDrawMatchUps ??
    getAllDrawMatchUps({
      inContext: true,
      drawDefinition,
      matchUpsMap,
    })?.matchUps;

  const seedBlockInfo = getValidSeedBlocks({
    provisionalPositioning,
    appliedPolicies,
    drawDefinition,
    seedingProfile,
    structure,
    random,
  });
  if (seedBlockInfo.error) return handleErrorCondition(seedBlockInfo, applyPositioning);
  const { validSeedBlocks } = seedBlockInfo;

  positioningReport.push({ validSeedBlocks });

  const participants =
    params.participants ??
    (tournamentRecord
      ? getParticipants({
          withIndividualParticipants: true,
          convertExtensions: true,
          tournamentRecord,
        })?.participants
      : []);

  let unseededByePositions;
  if (getSeedPattern(structure.seedingProfile || seedingProfile) === WATERFALL) {
    const waterfallResult = handleWaterfall({
      qualifiersCount,
      placeByes,
      provisionalPositioning,
      tournamentRecord,
      appliedPolicies,
      drawDefinition,
      seedBlockInfo,
      matchUpsMap,
      structure,
      seedLimit,
      seedsOnly,
      event,
      structureSeedingProfile: structure.seedingProfile,
      seedingProfile,
      inContextDrawMatchUps,
      participants,
      positioningReport,
      random,
    });
    if (waterfallResult?.error) return handleErrorCondition({ error: waterfallResult.error }, applyPositioning);
    unseededByePositions = waterfallResult.unseededByePositions;
  } else {
    const nonWaterfallResult = handleNonWaterfall({
      qualifiersCount,
      drawType,
      structureSeedingProfile: structure.seedingProfile,
      seedingProfile,
      provisionalPositioning,
      inContextDrawMatchUps,
      tournamentRecord,
      appliedPolicies,
      validSeedBlocks,
      drawDefinition,
      seedBlockInfo,
      participants,
      matchUpsMap,
      structure,
      event,
      placeByes,
      seedLimit,
      seedsOnly,
      positioningReport,
      random,
    });
    if (nonWaterfallResult?.error) return handleErrorCondition({ error: nonWaterfallResult.error }, applyPositioning);
    unseededByePositions = nonWaterfallResult.unseededByePositions;
  }

  const conflicts: any = {};

  const qualifiersResult = handleQualifiersAndUnseeded({
    seedsOnly,
    inContextDrawMatchUps,
    tournamentRecord,
    appliedPolicies,
    validSeedBlocks,
    drawDefinition,
    seedBlockInfo,
    participants,
    matchUpsMap,
    structure,
    positionQualifiers,
    positionUnseededParticipants,
    provisionalPositioning,
    unseededByePositions,
    multipleStructures,
    qualifiersCount,
    structureId,
    drawSize,
    event,
    positioningReport,
    conflicts,
    random,
  });
  if (qualifiersResult?.error) return handleErrorCondition({ error: qualifiersResult.error }, applyPositioning);

  const { positionAssignments } = getPositionAssignments({
    drawDefinition,
    structure,
  });

  modifyDrawNotice({ drawDefinition, structureIds: [structureId] });

  if (!applyPositioning) enableNotifications();

  const seedAssignments = structure.seedAssignments;
  return { positionAssignments, seedAssignments, conflicts, ...SUCCESS, positioningReport };
}
