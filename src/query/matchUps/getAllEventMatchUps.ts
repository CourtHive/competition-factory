import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import { hydrateParticipants } from '@Query/participants/hydrateParticipants';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import { definedAttributes } from '@Tools/definedAttributes';
import { getAllDrawMatchUps } from './drawMatchUps';

// constants and types
import { MISSING_EVENT } from '@Constants/errorConditionConstants';
import { GetMatchUpsArgs } from '@Types/factoryTypes';
import { HydratedMatchUp } from '@Types/hydrated';

export function allEventMatchUps(params: GetMatchUpsArgs) {
  let { participants = [], contextContent, participantMap } = params;
  const {
    scheduleVisibilityFilters,
    tournamentAppliedPolicies,
    participantsProfile,
    afterRecoveryTimes,
    policyDefinitions,
    useParticipantMap,
    tournamentRecord,
    usePublishState,
    contextFilters,
    matchUpFilters,
    contextProfile,
    nextMatchUps,
    inContext,
    context,
    event,
  } = params;
  if (!event) return { error: MISSING_EVENT };
  const { eventId, eventName, endDate, eventType, category, gender, matchUpFormat } = event ?? {};

  const additionalContext = {
    ...context,
    ...definedAttributes({
      indoorOutDoor: event.indoorOutdoor ?? tournamentRecord?.indoorOutdoor,
      surfaceCategory: event.surfaceCategory ?? tournamentRecord?.surfaceCategory,
      endDate: event.endDate ?? tournamentRecord?.endDate,
      tournamentId: tournamentRecord?.tournamentId,
      matchUpFormat,
      eventName,
      eventType,
      category,
      eventId,
      gender,
    }),
  };
  if (endDate) additionalContext.endDate = endDate;

  if (contextProfile && !contextContent) {
    contextContent = getContextContent({
      policyDefinitions,
      tournamentRecord,
      contextProfile,
      event,
    });
  }

  let groupInfo;
  if (!participants?.length && !participantMap && tournamentRecord) {
    const hydratedParticipantResult = hydrateParticipants({
      participantsProfile,
      useParticipantMap,
      policyDefinitions,
      tournamentRecord,
      contextProfile,
      inContext,
    });
    participantMap = hydratedParticipantResult.participantMap;
    participants = hydratedParticipantResult.participants ?? [];
    groupInfo = hydratedParticipantResult.groupInfo;
  }

  const drawDefinitions = event.drawDefinitions ?? [];
  const scheduleTiming = getScheduleTiming({
    tournamentRecord,
    event,
  }).scheduleTiming;

  const matchUps: HydratedMatchUp[] = drawDefinitions.flatMap((drawDefinition) => {
    const { matchUps } = getAllDrawMatchUps({
      tournamentParticipants: participants,
      tournamentAppliedPolicies,
      scheduleVisibilityFilters,
      context: additionalContext,
      participantsProfile,
      afterRecoveryTimes,
      policyDefinitions,
      tournamentRecord,
      usePublishState,
      contextFilters,
      contextProfile,
      drawDefinition,
      contextContent,
      matchUpFilters,
      participantMap,
      scheduleTiming,
      nextMatchUps,
      inContext,
      event,
    });

    return matchUps ?? [];
  });

  return { matchUps, groupInfo };
}
