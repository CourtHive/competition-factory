import { addParticipantGroupings } from '@Query/drawDefinition/avoidance/addParticipantGroupings';
import { getStructureMatchUps } from '@Query/structure/getStructureMatchUps';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import { addUpcomingMatchUps } from '@Query/matchUp/addUpcomingMatchUps';
import { getExitProfiles } from '@Query/drawDefinition/getExitProfile';
import { decorateResult } from '@Functions/global/decorateResult';
import { getDrawStructures } from '@Acquire/findStructure';
import { filterMatchUps } from '@Query/filterMatchUps';
import { getMatchUpsMap } from './getMatchUpsMap';

// constants and types
import { MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { GroupsMatchUpsResult, MatchUpsMap, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';

/*
  return ALL matchUps within a drawDefinition, regardless of state
*/
export function getAllDrawMatchUps(params): ResultType & {
  matchUps?: HydratedMatchUp[];
  matchUpsMap?: MatchUpsMap;
} {
  const stack = 'getAllDrawMatchUps';
  Object.assign(params, { requireParticipants: false });

  const result = getDrawMatchUps(params);

  if (result.error) return decorateResult({ result, stack });

  const { abandonedMatchUps, completedMatchUps, upcomingMatchUps, pendingMatchUps, byeMatchUps, matchUpsMap } = result;

  const matchUps: HydratedMatchUp[] = (abandonedMatchUps ?? []).concat(
    ...(completedMatchUps ?? []),
    ...(upcomingMatchUps ?? []),
    ...(pendingMatchUps ?? []),
    ...(byeMatchUps ?? []),
  );

  return { matchUps, matchUpsMap };
}

export function getDrawMatchUps(params): GroupsMatchUpsResult {
  if (!params?.drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  let { tournamentParticipants, contextContent, matchUpsMap } = params;
  const {
    scheduleVisibilityFilters,
    tournamentAppliedPolicies,
    requireParticipants,
    participantsProfile,
    afterRecoveryTimes,
    policyDefinitions,
    tournamentRecord,
    usePublishState,
    contextFilters,
    matchUpFilters,
    scheduleTiming,
    participantMap,
    publishStatus,
    contextProfile,
    drawDefinition,
    nextMatchUps,
    inContext,
    context,
    event,
  } = params;

  let allAbandonedMatchUps: HydratedMatchUp[] = [];
  let allCompletedMatchUps: HydratedMatchUp[] = [];
  let allUpcomingMatchUps: HydratedMatchUp[] = [];
  let allPendingMatchUps: HydratedMatchUp[] = [];
  let allByeMatchUps: HydratedMatchUp[] = [];

  if (contextProfile && !contextContent) {
    contextContent = getContextContent({
      policyDefinitions,
      tournamentRecord,
      contextProfile,
      event,
    });
  }

  // getParticipants() calls allEventMatchUps()
  // ...so participants must be sourced directly from tournamentRecord
  // ...and groupings must be added independent of that

  let groupInfo;
  if (!tournamentParticipants?.length && tournamentRecord) {
    tournamentParticipants = tournamentRecord?.participants;

    if ((inContext || participantsProfile?.withGroupings) && tournamentParticipants?.length) {
      ({ participantsWithGroupings: tournamentParticipants, groupInfo } = addParticipantGroupings({
        participants: tournamentParticipants,
        participantsProfile,
      }));
    }
  }

  const { structures } = getDrawStructures({ drawDefinition });
  if (!structures) return { error: STRUCTURE_NOT_FOUND };

  if (!matchUpsMap) {
    matchUpsMap = getMatchUpsMap({ drawDefinition });
  }

  const exitProfiles = drawDefinition && getExitProfiles({ drawDefinition }).exitProfiles;

  structures.forEach((structure) => {
    const {
      byeMatchUps = [],
      pendingMatchUps = [],
      upcomingMatchUps = [],
      completedMatchUps = [],
      abandonedMatchUps = [],
    } = getStructureMatchUps({
      // if nextMatchUps then the filters can't be applied at this level
      matchUpFilters: !nextMatchUps ? matchUpFilters : undefined,
      contextFilters: !nextMatchUps ? contextFilters : undefined,
      inContext: inContext || nextMatchUps || contextFilters,
      hydrateParticipants: params.hydrateParticipants,
      tournamentAppliedPolicies,
      scheduleVisibilityFilters,
      tournamentParticipants,
      requireParticipants,
      afterRecoveryTimes,
      policyDefinitions,
      tournamentRecord,
      usePublishState,
      contextContent,
      participantMap,
      scheduleTiming,
      publishStatus,
      contextProfile,
      drawDefinition,
      exitProfiles,
      matchUpsMap,
      structure,
      context,
      event,
    });

    allAbandonedMatchUps = allAbandonedMatchUps.concat(...abandonedMatchUps);
    allCompletedMatchUps = allCompletedMatchUps.concat(...completedMatchUps);
    allUpcomingMatchUps = allUpcomingMatchUps.concat(...upcomingMatchUps);
    allPendingMatchUps = allPendingMatchUps.concat(...pendingMatchUps);
    allByeMatchUps = allByeMatchUps.concat(...byeMatchUps);
  });

  // only apply this filter if filters haven't already been applied
  const applyFilter = (matchUps) => {
    if (!matchUpFilters && !nextMatchUps && !contextFilters) return matchUps;
    if (matchUpFilters) {
      matchUps = filterMatchUps({ matchUps, ...matchUpFilters });
    }
    if (contextFilters) {
      matchUps = filterMatchUps({
        matchUps,
        ...contextFilters,
        processContext: true,
      });
    }
    return matchUps;
  };

  const drawMatchUpsResult = {
    abandonedMatchUps: applyFilter(allAbandonedMatchUps),
    completedMatchUps: applyFilter(allCompletedMatchUps),
    upcomingMatchUps: applyFilter(allUpcomingMatchUps),
    pendingMatchUps: applyFilter(allPendingMatchUps),
    byeMatchUps: applyFilter(allByeMatchUps),
    matchUpsMap,
    ...SUCCESS,
    groupInfo,
  };

  if (nextMatchUps) {
    const nextFilter: any = typeof nextMatchUps === 'object' || {
      abandoned: true,
      completed: true,
      upcoming: true,
      pending: true,
      bye: true,
    };
    const { abandoned, completed, upcoming, pending, bye } = nextFilter;
    const matchUps = [].concat(
      ...((abandoned && allAbandonedMatchUps) ?? []),
      ...((completed && allCompletedMatchUps) ?? []),
      ...((upcoming && allUpcomingMatchUps) ?? []),
      ...((pending && allPendingMatchUps) ?? []),
      ...((bye && allByeMatchUps) ?? []),
    );
    addUpcomingMatchUps({
      inContextDrawMatchUps: matchUps,
      drawDefinition,
    });
  }

  return drawMatchUpsResult;
}
