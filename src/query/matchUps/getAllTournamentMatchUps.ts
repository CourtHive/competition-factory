import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { hydrateParticipants } from '@Query/participants/hydrateParticipants';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import { allEventMatchUps } from './getAllEventMatchUps';

// constants and types
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { GetMatchUpsArgs, ResultType } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

export function allTournamentMatchUps(params?: GetMatchUpsArgs): ResultType & {
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
    inContext = true,
    usePublishState,
    contextProfile,
    matchUpFilters,
    contextFilters,
    nextMatchUps,
    context,
  } = params;

  const tournamentId = params.tournamentId ?? tournamentRecord.tournamentId;
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

  const additionalContext: { [key: string]: any } = {
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
          tournamentAppliedPolicies,
          participantsProfile,
          afterRecoveryTimes,
          policyDefinitions,
          tournamentRecord,
          usePublishState,
          contextContent,
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
    // NOTE: matchUps on the tournamentRecord have no drawPositions and no
    // structureId/drawId/eventId/tournamentId (they're standalone matchUps,
    // not inside a structure). The cast acknowledges that the merged array
    // is a mix of HydratedMatchUp[] (from the per-event hydration above)
    // and base MatchUp[]; downstream consumers that rely on hydrated fields
    // must check `matchUp.structureId` first.
    .concat(...((tournamentRecord.matchUps ?? []) as HydratedMatchUp[]));

  return { matchUps };
}
