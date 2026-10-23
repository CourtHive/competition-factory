import { getSeedsCountAndStageEntries, seeding, SeededParticipant } from '@Mutate/drawDefinitions/structureSeeding';
import { positionUnseededParticipants } from '@Mutate/matchUps/drawPositions/positionUnseededParticipants';
import { positionQualifiers, getQualifiersData } from '@Mutate/matchUps/drawPositions/positionQualifiers';
import { getSeedPattern, getValidSeedBlocks, SeedBlockInfo } from '@Query/drawDefinition/seedGetter';
import { disableNotifications, enableNotifications } from '@Global/state/globalState';
import { positionSeedBlocks } from '@Mutate/matchUps/drawPositions/positionSeeds';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { positionByes } from './positionGovernor/byePositioning/positionByes';
import { getQualifiersCount } from '@Query/drawDefinition/getQualifiersCount';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { composeThenWrite, isStoredDraw } from '@Tools/composeThenWrite';
import { getParticipants } from '@Query/participants/getParticipants';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { decorateResult } from '@Functions/global/decorateResult';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { PolicyDefinitions, SeedBlock, SeedingProfile, MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { HydratedMatchUp, HydratedParticipant } from '@Types/hydrated';
import { WATERFALL } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

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

type AutomatedPositioningResult = ResultType & {
  positionAssignments?: PositionAssignment[];
  seedAssignments?: SeedAssignment[];
  positioningReport?: { [key: string]: any }[];
  success?: boolean;
  conflicts?: any[];
};

/**
 * Positions a structure: seeds, BYEs, qualifiers and the unseeded, in the order the seeding profile asks.
 *
 * COMPOSE, THEN WRITE. Each step places on the draw the next step reads, and a later step can refuse
 * (the unseeded find too few seats once the seeds and BYEs are placed; a qualifier finds no seat). So the
 * whole positioning is first composed on a working copy of the draw; a refusal there is returned with the
 * stored record untouched, and only a positioning that composed is written — making the same choices
 * (`composeThenWrite`). `applyPositioning: false` is the composition alone: the copy's positioning is
 * returned and the stored draw is not written.
 */
export function automatedPositioning(params: AutomatedPositioningArgs): AutomatedPositioningResult {
  // a preview, or a draw still being generated (a refusal discards it whole)
  if (params.applyPositioning === false || !isStoredDraw(params)) return positionStructure(params);

  return composeThenWrite({
    // the working copy is the draw's; a map or hydration the caller built from the stored draw is not
    compose: (random) =>
      positionStructure({
        ...params,
        inContextDrawMatchUps: undefined,
        applyPositioning: false,
        matchUpsMap: undefined,
        random,
      }),
    write: (random) => positionStructure({ ...params, random }),
    random: params.random,
  });
}

/**
 * One structure's positioning, against `drawDefinition` as given — or, with `applyPositioning: false`,
 * against a copy of it with notifications held. Not atomic on its own: callers compose first.
 */
export function positionStructure(params: AutomatedPositioningArgs): AutomatedPositioningResult {
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
