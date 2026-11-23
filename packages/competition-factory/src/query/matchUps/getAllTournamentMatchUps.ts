import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { stripCheckInAttribution } from '@Query/participants/participantPrivacy';
import { hydrateParticipants } from '@Query/participants/hydrateParticipants';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import { withContextExclusion } from './contextExclusion';
import { allEventMatchUps } from './getAllEventMatchUps';
import { createHydrationCache } from './hydrationCache';
import { filterMatchUps } from '@Query/filterMatchUps';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants and types
import { GetMatchUpsArgs, MatchUpFilters, ResultType } from '@Types/factoryTypes';
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

export function allTournamentMatchUps(params?: GetMatchUpsArgs) {
  return withContextExclusion(params, allTournamentMatchUpsUnredacted);
}

function allTournamentMatchUpsUnredacted(params?: GetMatchUpsArgs): ResultType & {
  matchUps?: HydratedMatchUp[];
} {
  const paramsCheck = checkRequiredParameters(params, [{ tournamentRecord: true }]);
  if (paramsCheck.error) return paramsCheck;

  if (!params?.tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  let { participantMap, participants } = params;
  const {
    scheduleVisibilityFilters,
    participantsProfile,
    afterRecoveryTimes,
    useParticipantMap, // will default to true in future release
    policyDefinitions,
    tournamentRecord,
    hydrateParticipants: hydrateSideParticipants,
    inContext = true,
    usePublishState,
    contextProfile,
    matchUpFilters,
    contextFilters,
    nextMatchUps,
    context,
  } = params;

  const tournamentId = params.tournamentId ?? tournamentRecord.tournamentId;
  const hydrationCache = params.hydrationCache ?? createHydrationCache();
  const events = tournamentRecord?.events ?? [];

  if (!participants) {
    ({ participants, participantMap } = hydrateParticipants({
      participantsProfile,
      useParticipantMap,
      policyDefinitions,
      tournamentRecord,
      contextProfile,
      inContext,
    }));
  }

  const { appliedPolicies: tournamentAppliedPolicies } = getAppliedPolicies({
    tournamentRecord,
  });

  const additionalContext: { [key: string]: unknown } = {
    ...context,
    tournamentId,
    indoorOutDoor: tournamentRecord.indoorOutdoor,
    surfaceCategory: tournamentRecord.surfaceCategory,
    endDate: tournamentRecord.endDate,
  };

  const contextContent = getContextContent({
    policyDefinitions,
    tournamentRecord,
    contextProfile,
  });

  const matchUps = events
    .flatMap((event) => {
      additionalContext.eventDrawsCount = event.drawDefinitions?.length ?? 0;

      return (
        allEventMatchUps({
          context: additionalContext,
          scheduleVisibilityFilters,
          hydrationCache,
          tournamentAppliedPolicies,
          participantsProfile,
          afterRecoveryTimes,
          policyDefinitions,
          tournamentRecord,
          usePublishState,
          contextContent,
          hydrateParticipants: hydrateSideParticipants,
          contextFilters,
          contextProfile,
          matchUpFilters,
          participantMap,
          nextMatchUps,
          participants,
          inContext,
          event,
        }).matchUps ?? []
      );
    })
    .concat(...getStandaloneMatchUps({ tournamentRecord, matchUpFilters, contextFilters, inContext }));

  return { matchUps };
}

/**
 * matchUps on the tournamentRecord have no drawPositions and no structureId/drawId/eventId/tournamentId
 * (they're standalone matchUps, not inside a structure). The cast acknowledges that the merged array is a
 * mix of HydratedMatchUp[] (from the per-event hydration above) and base MatchUp[]; downstream consumers
 * that rely on hydrated fields must check `matchUp.structureId` first.
 *
 * They pass through the same boundary as drawn matchUps: the same filters, and when `inContext` a copy
 * with check-in attribution stripped (D-PRIV). Without `inContext` the stored objects are returned, as
 * they are for drawn matchUps, because mutations read this list to find the matchUps they edit.
 */
function getStandaloneMatchUps(params: {
  matchUpFilters?: MatchUpFilters;
  contextFilters?: MatchUpFilters;
  tournamentRecord: Tournament;
  inContext?: boolean;
}): HydratedMatchUp[] {
  const { tournamentRecord, matchUpFilters, contextFilters, inContext } = params;
  let matchUps = (tournamentRecord.matchUps ?? []) as HydratedMatchUp[];
  if (!matchUps.length) return matchUps;

  // a filter scoped to events, draws or structures selects none of them: a standalone matchUp belongs to none
  if (scopesStructures(matchUpFilters) || scopesStructures(contextFilters)) return [];

  if (matchUpFilters) matchUps = filterMatchUps({ ...matchUpFilters, matchUps });
  if (contextFilters) matchUps = filterMatchUps({ processContext: true, ...contextFilters, matchUps });
  if (!inContext) return matchUps;

  return (stripCheckInAttribution(matchUps.map((matchUp) => makeDeepCopy(matchUp, true, true))) ??
    []) as HydratedMatchUp[];
}

function scopesStructures(filters?: MatchUpFilters): boolean {
  return [filters?.eventIds, filters?.drawIds, filters?.structureIds].some(
    (ids) => Array.isArray(ids) && ids.some(Boolean),
  );
}
