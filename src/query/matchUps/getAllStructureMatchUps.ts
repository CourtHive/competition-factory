import { getMatchUpCompetitiveProfile } from '@Query/matchUp/getMatchUpCompetitiveProfile';
import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { resolveCompetitiveBands } from '@Query/matchUp/resolveCompetitiveBands';
import { getCollectionPositionMatchUps } from './getCollectionPositionMatchUps';
import { getMatchUpsMap, getMappedStructureMatchUps } from './getMatchUpsMap';
import { hydrateParticipants } from '@Query/participants/hydrateParticipants';
import { getSourceDrawPositionRanges } from './getSourceDrawPositionRanges';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import { createHydrationCache, HydrationCache } from './hydrationCache';
import { getExitProfiles } from '@Query/drawDefinition/getExitProfile';
import { getDrawPositionsRanges } from './getDrawPositionsRanges';
import { getRoundContextProfile } from './getRoundContextProfile';
import { withContextExclusion } from './contextExclusion';
import { structuresOf } from '@Acquire/structureMembers';
import { addMatchUpContext } from './addMatchUpContext';
import { filterMatchUps } from '@Query/filterMatchUps';
import { getRoundMatchUps } from './getRoundMatchUps';

// constants and types
import { MISSING_STRUCTURE } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_ROUND_NAMING } from '@Constants/policyConstants';
import type { ErrorType } from '@Constants/errorConditionConstants';
import type { HydratedMatchUp } from '@Types/hydrated';
import {
  ContextContent,
  ContextProfile,
  ExitProfiles,
  MatchUpFilters,
  MatchUpsMap,
  ParticipantMap,
  ParticipantsProfile,
  PolicyDefinitions,
  RoundProfile,
  ScheduleTiming,
  ScheduleVisibilityFilters,
} from '@Types/factoryTypes';
import {
  Participant,
  Tournament,
  Event,
  Structure,
  DrawDefinition,
  SeedAssignment,
  MatchUp,
} from '@Types/tournamentTypes';

/*
  return all matchUps within a structure and its child structures
  context is used to pass in additional parameters to be assigned to each matchUp
*/

type GetAllStructureMatchUps = {
  scheduleVisibilityFilters?: ScheduleVisibilityFilters;
  tournamentAppliedPolicies?: PolicyDefinitions;
  participantsProfile?: ParticipantsProfile;
  tournamentParticipants?: Participant[];
  policyDefinitions?: PolicyDefinitions;
  seedAssignments?: SeedAssignment[];
  provisionalPositioning?: boolean;
  context?: { [key: string]: any };
  contextContent?: ContextContent;
  contextFilters?: MatchUpFilters;
  matchUpFilters?: MatchUpFilters;
  participantMap?: ParticipantMap;
  scheduleTiming?: ScheduleTiming;
  hydrateParticipants?: boolean;
  drawDefinition?: DrawDefinition;
  contextProfile?: ContextProfile;
  tournamentRecord?: Tournament;
  /** Shared by every structure of one read; created here when the caller has none. */
  hydrationCache?: HydrationCache;
  afterRecoveryTimes?: boolean;
  useParticipantMap?: boolean;
  usePublishState?: boolean;
  /**
   * Hydrate ONLY the matchUp with this id (or the dual it is a line of) — the structure-level
   * profiles are still taken from every matchUp in the structure. For a caller that wants one
   * matchUp in context; see `findDrawMatchUp`. The other matchUps are not returned.
   */
  hydrateMatchUpId?: string;
  exitProfiles?: ExitProfiles;
  matchUpsMap?: MatchUpsMap;
  structure?: Structure;
  publishStatus?: any;
  inContext?: boolean;
  event?: Event;
};

/** Tie-inclusive in both modes: only teamLevelMatchUps removes collection matchUps. */
export type AllStructureMatchUpsResult<M extends MatchUp = MatchUp> = {
  matchUps: M[];
  roundMatchUps: Record<number, M[]>;
  collectionPositionMatchUps: Record<number, M[]>;
  roundProfile?: RoundProfile;
  matchUpsMap?: MatchUpsMap;
  isRoundRobin?: boolean;
  error?: ErrorType;
};

export function getAllStructureMatchUps(
  params: GetAllStructureMatchUps & { inContext: true },
): AllStructureMatchUpsResult<HydratedMatchUp>;
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function getAllStructureMatchUps(params: GetAllStructureMatchUps): AllStructureMatchUpsResult;
// eslint-disable-next-line no-redeclare -- TypeScript overload, not a second implementation
export function getAllStructureMatchUps(params: GetAllStructureMatchUps): AllStructureMatchUpsResult {
  return withContextExclusion(params, getAllStructureMatchUpsUnredacted);
}

function getAllStructureMatchUpsUnredacted(params: GetAllStructureMatchUps): AllStructureMatchUpsResult {
  const {
    provisionalPositioning,
    tournamentRecord,
    contextFilters,
    matchUpFilters,
    contextProfile,
    drawDefinition,
    context = {},
    structure,
    inContext,
    event,
  } = params;

  let { seedAssignments, contextContent, exitProfiles, matchUpsMap } = params;

  let collectionPositionMatchUps: Record<number, MatchUp[]> = {};
  let roundMatchUps: Record<number, MatchUp[]> = {};

  if (!structure) {
    return {
      collectionPositionMatchUps,
      error: MISSING_STRUCTURE,
      roundMatchUps,
      matchUps: [],
    };
  }

  const selectedEventIds = Array.isArray(matchUpFilters?.eventIds) ? matchUpFilters?.eventIds.filter(Boolean) : [];

  const selectedStructureIds = Array.isArray(matchUpFilters?.structureIds)
    ? matchUpFilters?.structureIds.filter(Boolean)
    : [];

  const selectedDrawIds = Array.isArray(matchUpFilters?.drawIds) ? matchUpFilters?.drawIds.filter(Boolean) : [];

  const targetEvent =
    !context?.eventId ||
    (!selectedEventIds?.length && !contextFilters?.eventIds?.filter(Boolean).length) ||
    selectedEventIds?.includes(context.eventId) ||
    contextFilters?.eventIds?.includes(context.eventId);
  const targetStructure = !selectedStructureIds?.length || selectedStructureIds.includes(structure.structureId);
  const targetDraw = !drawDefinition || !selectedDrawIds?.length || selectedDrawIds.includes(drawDefinition.drawId);

  // don't process this structure if filters and filters don't include eventId, drawId or structureId
  if (!targetEvent || !targetStructure || !targetDraw) {
    return {
      collectionPositionMatchUps,
      roundMatchUps,
      matchUps: [],
    };
  }

  if (contextProfile && !contextContent) {
    contextContent = getContextContent({
      tournamentRecord,
      contextProfile,
      drawDefinition,
    });
  }

  const { appliedPolicies: drawAppliedPolicies } = getAppliedPolicies({ drawDefinition });
  const appliedPolicies = {
    ...params.tournamentAppliedPolicies,
    ...drawAppliedPolicies,
    ...params.policyDefinitions,
  };

  const structureScoringPolicies = appliedPolicies?.scoring?.structures;
  const stageSpecificPolicies = structure.stage && structureScoringPolicies?.stage?.[structure.stage];
  const sequenceSpecificPolicies =
    structure.stageSequence && stageSpecificPolicies?.stageSequence?.[structure.stageSequence];
  const requireAllPositionsAssigned =
    appliedPolicies?.scoring?.requireAllPositionsAssigned ||
    stageSpecificPolicies?.requireAllPositionsAssigned ||
    sequenceSpecificPolicies?.requireAllPositionsAssigned;

  matchUpsMap ??= getMatchUpsMap({ drawDefinition, structure });

  const { positionAssignments, allPositionsAssigned } = structureAssignedDrawPositions({ structure });
  const scoringActive = !requireAllPositionsAssigned || allPositionsAssigned;
  const { seedAssignments: structureSeedAssignments } = getStructureSeedAssignments({
    provisionalPositioning,
    drawDefinition,
    structure,
  });

  // enables passing in seedAssignments rather than using structureSeedAssignments
  seedAssignments = seedAssignments ?? structureSeedAssignments;

  const { structureId } = structure;

  exitProfiles = exitProfiles ?? (drawDefinition && getExitProfiles({ drawDefinition }).exitProfiles);
  const exitProfile = exitProfiles?.[structureId];
  const initialRoundOfPlay =
    exitProfile?.length &&
    (exitProfile[0]
      .split('-')
      .map((x) => Number.parseInt(x))
      .reduce((a, b) => a + b, 0) ||
      0);

  const isRoundRobin = !!structuresOf(structure);

  let matchUps = getMappedStructureMatchUps({
    matchUpsMap,
    structureId,
    inContext,
  });

  const roundNamingPolicy = appliedPolicies?.[POLICY_TYPE_ROUND_NAMING];
  const result = getRoundContextProfile({
    roundNamingPolicy,
    drawDefinition,
    structure,
    matchUps,
  });
  const { roundNamingProfile, roundProfile } = result;
  roundMatchUps = result?.roundMatchUps ?? [];

  // must make a pass before hydration and addition of tieMatchUps
  // preserve matchUps with tieMatchUps so their children can be extracted and filtered independently
  if (matchUpFilters) {
    const tieMatchUpIds = new Set(matchUps.filter((m) => Array.isArray(m.tieMatchUps)).map((m) => m.matchUpId));
    matchUps = filterMatchUps({
      matchUps: tieMatchUpIds.size ? matchUps.filter((m) => !tieMatchUpIds.has(m.matchUpId)) : matchUps,
      ...matchUpFilters,
      filterMatchUpTypes: false,
      filterMatchUpIds: false,
    }).concat(tieMatchUpIds.size ? matchUps.filter((m) => tieMatchUpIds.has(m.matchUpId)) : []);
  }

  if (inContext) {
    matchUps = selectProjectionCandidates({
      matchUpIds: params.hydrateMatchUpId ? [params.hydrateMatchUpId] : matchUpFilters?.matchUpIds,
      matchUps,
    });
    matchUps = hydrateMatchUpsInContext({
      positionAssignments,
      initialRoundOfPlay,
      roundNamingProfile,
      tournamentRecord,
      appliedPolicies,
      seedAssignments,
      contextContent,
      contextProfile,
      drawDefinition,
      contextFilters,
      scoringActive,
      isRoundRobin,
      roundProfile,
      matchUpsMap,
      structureId,
      structure,
      context,
      params,
      event,
      matchUps,
    });
  } else {
    matchUps = appendTieMatchUps(matchUps);
    if (contextProfile?.withCompetitiveness) {
      matchUps = enrichMatchUpsWithCompetitiveProfile({
        policyDefinitions: params.policyDefinitions,
        tournamentRecord,
        drawDefinition,
        structure,
        matchUps,
        event,
      });
    }
  }

  // must make a pass after tieMatchUps have been added
  if (matchUpFilters) {
    matchUps = filterMatchUps({
      matchUps,
      ...matchUpFilters,
      filterMatchUpTypes: false,
      filterMatchUpIds: false,
    });
  }
  // now filter again if there are any matchUpTypes or matchUpIds
  if (matchUpFilters?.matchUpTypes || matchUpFilters?.matchUpIds) {
    matchUps = filterMatchUps({
      matchUpTypes: matchUpFilters.matchUpTypes,
      matchUpIds: matchUpFilters.matchUpIds,
      matchUps,
    });
  }

  if (matchUpFilters?.matchUpTypes || matchUpFilters?.matchUpIds || inContext) {
    roundMatchUps = getRoundMatchUps({ matchUps }).roundMatchUps ?? [];
  }

  if (resolveTieFormat({ drawDefinition, structure, event })?.tieFormat) {
    ({ collectionPositionMatchUps } = getCollectionPositionMatchUps({
      matchUps,
    }));
  }

  return {
    collectionPositionMatchUps,
    roundMatchUps,
    isRoundRobin,
    roundProfile,
    matchUpsMap,
    matchUps,
  };
}

/**
 * Only the matchUps that can be returned are hydrated: those named, and the dual each named line belongs
 * to (a line is hydrated inside its dual, from the dual's lineUps). Every structure-level profile above was
 * already taken from all of the structure's matchUps, and each matchUp is hydrated independently of the
 * others, so narrowing here changes the work and not the result. The matchUpIds filter after hydration
 * still decides what is returned: a dual kept for its line is dropped there unless it was named too.
 */
function selectProjectionCandidates({ matchUpIds, matchUps }: { matchUpIds?: string[]; matchUps: MatchUp[] }) {
  const targetIds = new Set(Array.isArray(matchUpIds) ? matchUpIds.filter(Boolean) : []);
  if (!targetIds.size) return matchUps;
  return matchUps.filter(
    (matchUp) =>
      targetIds.has(matchUp.matchUpId) ||
      matchUp.tieMatchUps?.some((tieMatchUp) => targetIds.has(tieMatchUp.matchUpId)),
  );
}

function appendTieMatchUps(matchUps: MatchUp[]): MatchUp[] {
  const matchUpTies = matchUps?.filter((matchUp) => Array.isArray(matchUp.tieMatchUps));
  let result = matchUps;
  matchUpTies.forEach((matchUpTie) => {
    result = result.concat(...(matchUpTie.tieMatchUps ?? []));
  });
  return result;
}

function enrichMatchUpsWithCompetitiveProfile({
  policyDefinitions,
  tournamentRecord,
  drawDefinition,
  structure,
  matchUps,
  event,
}) {
  const profileBands = resolveCompetitiveBands({
    policyDefinitions,
    tournamentRecord,
    drawDefinition,
    structure,
    event,
  });
  return matchUps.map((matchUp) => {
    if (matchUp.competitiveProfile || !matchUp.winningSide) return matchUp;
    const competitiveProfile = getMatchUpCompetitiveProfile({ profileBands, matchUp });
    if (competitiveProfile.error) return matchUp;
    return { ...matchUp, competitiveProfile };
  });
}

function hydrateMatchUpsInContext({
  positionAssignments,
  initialRoundOfPlay,
  roundNamingProfile,
  tournamentRecord,
  appliedPolicies,
  seedAssignments,
  contextContent,
  contextProfile,
  drawDefinition,
  contextFilters,
  scoringActive,
  isRoundRobin,
  roundProfile,
  matchUpsMap,
  structureId,
  structure,
  context,
  params,
  event,
  matchUps,
}) {
  const { sourceDrawPositionRanges } = getSourceDrawPositionRanges({
    drawDefinition,
    matchUpsMap,
    structureId,
  });
  const drawPositionsRanges = drawDefinition
    ? getDrawPositionsRanges({
        drawDefinition,
        roundProfile,
        matchUpsMap,
        structureId,
      }).drawPositionsRanges
    : undefined;

  let tournamentParticipants = params.tournamentParticipants;
  let participantMap = params.participantMap;
  const hydrationCache = params.hydrationCache ?? createHydrationCache();

  if (!tournamentParticipants?.length && !participantMap && tournamentRecord) {
    ({ participants: tournamentParticipants = [], participantMap } = hydrateParticipants({
      participantsProfile: params.participantsProfile,
      useParticipantMap: params.useParticipantMap,
      policyDefinitions: params.policyDefinitions,
      tournamentRecord,
      contextProfile,
      inContext: true,
    }));
  }

  let result = matchUps.map((matchUp) => {
    return addMatchUpContext({
      scheduleVisibilityFilters: params.scheduleVisibilityFilters,
      hydrateParticipants: params.hydrateParticipants,
      afterRecoveryTimes: params.afterRecoveryTimes,
      usePublishState: params.usePublishState,
      scheduleTiming: params.scheduleTiming,
      publishStatus: params.publishStatus,
      sourceDrawPositionRanges,
      tournamentParticipants,
      positionAssignments,
      drawPositionsRanges,
      initialRoundOfPlay,
      roundNamingProfile,
      tournamentRecord,
      appliedPolicies,
      seedAssignments,
      hydrationCache,
      contextContent,
      participantMap,
      contextProfile,
      drawDefinition,
      scoringActive,
      isRoundRobin,
      roundProfile,
      structure,
      context,
      matchUp,
      event,
    });
  });

  result = appendTieMatchUps(result);

  if (contextFilters) {
    result = filterMatchUps({
      processContext: true,
      ...contextFilters,
      matchUps: result,
    });
  }

  return result;
}
