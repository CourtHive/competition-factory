import { hydrateParticipants } from '@Query/participants/hydrateParticipants';
import { getContextContent } from '@Query/hierarchical/getContextContent';
import { definedAttributes } from '@Tools/definedAttributes';
import { getDrawMatchUps } from './drawMatchUps';

// types
import { GetMatchUpsArgs } from '@Types/factoryTypes';

export function drawMatchUps({
  participants: tournamentParticipants,
  tournamentAppliedPolicies,
  scheduleVisibilityFilters,
  participantsProfile,
  afterRecoveryTimes,
  policyDefinitions,
  useParticipantMap,
  tournamentRecord,
  usePublishState,
  contextFilters,
  contextContent,
  matchUpFilters,
  participantMap,
  publishStatus,
  contextProfile,
  drawDefinition,
  nextMatchUps,
  tournamentId,
  inContext,
  context,
  event,
}: GetMatchUpsArgs) {
  const { eventId, eventName, endDate, eventType, category, gender } = event ?? {};

  const additionalContext = {
    ...context,
    ...definedAttributes({
      surfaceCategory: event?.surfaceCategory ?? tournamentRecord?.surfaceCategory,
      indoorOutDoor: event?.indoorOutdoor ?? tournamentRecord?.indoorOutdoor,
      endDate: endDate ?? event?.endDate ?? tournamentRecord?.endDate,
      tournamentId: tournamentId ?? tournamentRecord?.tournamentId,
      eventName,
      eventType,
      category,
      eventId,
      gender,
    }),
  };

  let groupInfo;
  if (!tournamentParticipants?.length && tournamentRecord) {
    ({
      participants: tournamentParticipants,
      participantMap,
      groupInfo,
    } = hydrateParticipants({
      participantsProfile,
      policyDefinitions,
      useParticipantMap,
      tournamentRecord,
      contextProfile,
      inContext,
    }));
  }

  if (event && contextProfile && !contextContent)
    contextContent = getContextContent({
      policyDefinitions,
      tournamentRecord,
      contextProfile,
      drawDefinition,
      event,
    });

  const drawMatchUpsResult = getDrawMatchUps({
    context: additionalContext,
    tournamentAppliedPolicies,
    scheduleVisibilityFilters,
    tournamentParticipants,
    participantsProfile,
    afterRecoveryTimes,
    policyDefinitions,
    tournamentRecord,
    usePublishState,
    participantMap,
    contextContent,
    contextFilters,
    matchUpFilters,
    publishStatus,
    contextProfile,
    drawDefinition,
    nextMatchUps,
    inContext,
    event,
  });

  return { ...drawMatchUpsResult, groupInfo };
}
