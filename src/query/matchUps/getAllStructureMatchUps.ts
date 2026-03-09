import { getStructureSeedAssignments } from '@Query/structure/getStructureSeedAssignments';
import { structureAssignedDrawPositions } from '@Query/drawDefinition/positionsGetter';
import { resolveTieFormat } from '@Query/hierarchical/tieFormats/resolveTieFormat';
import { getCollectionPositionMatchUps } from './getCollectionPositionMatchUps';
import { getMatchUpsMap, getMappedStructureMatchUps } from './getMatchUpsMap';
import { hydrateParticipants } from '@Query/participants/hydrateParticipants';
import { getSourceDrawPositionRanges } from './getSourceDrawPositionRanges';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import { getExitProfiles } from '@Query/drawDefinition/getExitProfile';
import { getDrawPositionsRanges } from './getDrawPositionsRanges';
import { getRoundContextProfile } from './getRoundContextProfile';
import { addMatchUpContext } from './addMatchUpContext';
import { getRoundMatchUps } from './getRoundMatchUps';
import { filterMatchUps } from '@Query/filterMatchUps';

// constants and types
import { Participant, Tournament, Event, Structure, DrawDefinition, SeedAssignment } from '@Types/tournamentTypes';
import { MISSING_STRUCTURE } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_ROUND_NAMING } from '@Constants/policyConstants';
import {
  ContextContent,
  ContextProfile,
  ExitProfiles,
  MatchUpFilters,
  MatchUpsMap,
  ParticipantMap,
  ParticipantsProfile,
  PolicyDefinitions,
  ScheduleTiming,
  ScheduleVisibilityFilters,
} from '@Types/factoryTypes';

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
  afterRecoveryTimes?: boolean;
  useParticipantMap?: boolean;
  usePublishState?: boolean;
  exitProfiles?: ExitProfiles;
  matchUpsMap?: MatchUpsMap;
  structure?: Structure;
  publishStatus?: any;
  inContext?: boolean;
  event?: Event;
};

export function getAllStructureMatchUps(params: GetAllStructureMatchUps) {
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

  let collectionPositionMatchUps = {},
    roundMatchUps = {};

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

  if (!matchUpsMap) {
    matchUpsMap = getMatchUpsMap({ drawDefinition, structure });
  }

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

  exitProfiles = exitProfiles || (drawDefinition && getExitProfiles({ drawDefinition }).exitProfiles);
  const exitProfile = exitProfiles?.[structureId];
  const initialRoundOfPlay =
    exitProfile?.length &&
    (exitProfile[0]
      .split('-')
      .map((x) => parseInt(x))
      .reduce((a, b) => a + b) ||
      0);

  const isRoundRobin = !!structure.structures;

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
    const tieMatchUpIds = new Set(
      matchUps.filter((m) => Array.isArray(m.tieMatchUps)).map((m) => m.matchUpId),
    );
    matchUps = filterMatchUps({
      matchUps: tieMatchUpIds.size ? matchUps.filter((m) => !tieMatchUpIds.has(m.matchUpId)) : matchUps,
      ...matchUpFilters,
      filterMatchUpTypes: false,
      filterMatchUpIds: false,
    }).concat(tieMatchUpIds.size ? matchUps.filter((m) => tieMatchUpIds.has(m.matchUpId)) : []);
  }

  if (inContext) {
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

    if (!tournamentParticipants?.length && !participantMap && tournamentRecord) {
      ({ participants: tournamentParticipants = [], participantMap } = hydrateParticipants({
        participantsProfile: params.participantsProfile,
        useParticipantMap: params.useParticipantMap,
        policyDefinitions: params.policyDefinitions,
        tournamentRecord,
        contextProfile,
        inContext,
      }));
    }

    matchUps = matchUps.map((matchUp) => {
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

    const matchUpTies = matchUps?.filter((matchUp) => Array.isArray(matchUp.tieMatchUps));
    matchUpTies.forEach((matchUpTie) => {
      const tieMatchUps = matchUpTie.tieMatchUps;
      matchUps = matchUps.concat(...tieMatchUps);
    });

    if (contextFilters) {
      matchUps = filterMatchUps({
        processContext: true,
        ...contextFilters,
        matchUps,
      });
    }
  } else {
    const matchUpTies = matchUps?.filter((matchUp) => Array.isArray(matchUp.tieMatchUps));
    matchUpTies.forEach((matchUpTie) => {
      const tieMatchUps = matchUpTie.tieMatchUps;
      matchUps = matchUps.concat(...tieMatchUps);
    });
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
