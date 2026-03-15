import { positionUnseededParticipants } from '../matchUps/drawPositions/positionUnseededParticipants';
import { getSeedPattern, getValidSeedBlocks } from '@Query/drawDefinition/seedGetter';
import { positionQualifiers } from '@Mutate/matchUps/drawPositions/positionQualifiers';
import { disableNotifications, enableNotifications } from '@Global/state/globalState';
import { positionSeedBlocks } from '@Mutate/matchUps/drawPositions/positionSeeds';
import { positionByes } from './positionGovernor/byePositioning/positionByes';
import { getPositionAssignments } from '@Query/drawDefinition/positionsGetter';
import { getQualifiersCount } from '@Query/drawDefinition/getQualifiersCount';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { isLuckyBasedDraw } from '@Query/drawDefinition/isLuckyBasedDraw';
import { getParticipants } from '@Query/participants/getParticipants';
import { getStageEntries } from '@Query/drawDefinition/stageGetter';
import { getAllDrawMatchUps } from '@Query/matchUps/drawMatchUps';
import { decorateResult } from '@Functions/global/decorateResult';
import { getMatchUpsMap } from '@Query/matchUps/getMatchUpsMap';
import { findStructure } from '@Acquire/findStructure';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { PolicyDefinitions, SeedingProfile, MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { DrawDefinition, Event, PositionAssignment, Tournament } from '@Types/tournamentTypes';
import { STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DIRECT_ENTRY_STATUSES } from '@Constants/entryStatusConstants';
import { HydratedMatchUp, HydratedParticipant } from '@Types/hydrated';
import { WATERFALL } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';

type AutomatedPositioningArgs = {
  inContextDrawMatchUps?: HydratedMatchUp[];
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
  placeByes?: boolean;
  structureId: string;
  seedsOnly?: boolean;
  seedLimit?: number;
  drawType?: string;
  drawSize?: number;
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

  const { qualifiersCount } = getQualifiersCount({
    stageSequence: structure.stageSequence,
    provisionalPositioning: params.provisionalPositioning,
    stage: structure.stage,
    drawDefinition,
    structureId,
  });

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
}) {
  let result: any = placeByes
    ? positionByes({
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
      })
    : undefined;
  if (result?.error) return { error: result.error };
  const unseededByePositions = result?.unseededByePositions;

  positioningReport.push({ action: 'positionByes', unseededByePositions });

  const profileSeeding = structureSeedingProfile ? { positioning: structureSeedingProfile } : seedingProfile;

  result = positionSeedBlocks({
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
    event,
  });
  if (result.error) return { error: result.error };

  positioningReport.push({
    seedPositions: result.seedPositions,
    action: 'positionSeedBlocks',
  });

  return { unseededByePositions };
}

function handleNonWaterfall({
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
}) {
  let unseededByePositions;
  if (!isLuckyBasedDraw(drawType)) {
    const profileSeeding = structureSeedingProfile ? { positioning: structureSeedingProfile } : seedingProfile;
    const result: any = positionSeedBlocks({
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
        drawDefinition,
        seedBlockInfo,
        matchUpsMap,
        structure,
        seedLimit,
        seedsOnly,
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
  structureId,
  drawSize,
  event,
  positioningReport,
  conflicts,
}) {
  if (seedsOnly) return {};
  let result: any = positionQualifiers({
    inContextDrawMatchUps,
    tournamentRecord,
    appliedPolicies,
    validSeedBlocks,
    drawDefinition,
    seedBlockInfo,
    participants,
    matchUpsMap,
    structure,
  });
  if (result.error) {
    return { error: result.error };
  }
  if (result.conflicts) conflicts.qualifierConflicts = result.conflicts;
  positioningReport.push({
    action: 'positionQualifiers',
    qualifierDrawPositions: result.qualifierDrawPositions,
  });

  result = positionUnseededParticipants({
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
    drawSize,
    event,
  });

  if (result.error) {
    return { error: result.error };
  }
  if (result.conflicts) conflicts.unseededConflicts = result.conflicts;
  positioningReport.push({ action: 'positionUnseededParticipants' });

  return {};
}

export function automatedPositioning(params: AutomatedPositioningArgs): ResultType & {
  positionAssignments?: PositionAssignment[];
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
    event,
  } = params;

  const positioningReport: any[] = [];

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
  if (initialError) return handleErrorCondition(initialError, applyPositioning);

  if (!entries?.length && !qualifiersCount) return handleSuccessCondition({ ...SUCCESS }, applyPositioning);

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
  });
  if (seedBlockInfo.error) return handleErrorCondition(seedBlockInfo, applyPositioning);
  const { validSeedBlocks } = seedBlockInfo;

  positioningReport.push({ validSeedBlocks });

  const participants =
    params.participants ||
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
    });
    if (waterfallResult?.error) return handleErrorCondition(waterfallResult.error, applyPositioning);
    unseededByePositions = waterfallResult.unseededByePositions;
  } else {
    const nonWaterfallResult = handleNonWaterfall({
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
    });
    if (nonWaterfallResult?.error) return handleErrorCondition(nonWaterfallResult.error, applyPositioning);
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
    structureId,
    drawSize,
    event,
    positioningReport,
    conflicts,
  });
  if (qualifiersResult?.error) return handleErrorCondition(qualifiersResult.error, applyPositioning);

  const { positionAssignments } = getPositionAssignments({
    drawDefinition,
    structure,
  });

  modifyDrawNotice({ drawDefinition, structureIds: [structureId] });

  if (!applyPositioning) enableNotifications();

  return { positionAssignments, conflicts, ...SUCCESS, positioningReport };
}
