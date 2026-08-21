import { applyParticipantPrivacy, getParticipantPrivacyTemplate } from '../participants/participantPrivacy';
import { hydrateParticipants } from '../participants/hydrateParticipants';
import { getAppliedPolicies } from '../extensions/getAppliedPolicies';
import { getContextContent } from '../hierarchical/getContextContent';
import { getFlightProfile } from '../event/getFlightProfile';

// Constants and types
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { GetMatchUpsArgs, GroupsMatchUpsResult } from '@Types/factoryTypes';
import { eventMatchUps } from './getEventMatchUps';

export function tournamentMatchUps(params: GetMatchUpsArgs): GroupsMatchUpsResult {
  if (!params?.tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  let contextContent = params.contextContent;
  const {
    scheduleVisibilityFilters,
    participantsProfile,
    afterRecoveryTimes,
    policyDefinitions,
    tournamentRecord,
    inContext = true,
    usePublishState,
    contextFilters,
    matchUpFilters,
    contextProfile,
    nextMatchUps,
    context,
  } = params;
  const tournamentId = params.tournamentId ?? tournamentRecord.tournamentId;
  const events = tournamentRecord?.events ?? [];

  const { participants, participantMap, groupInfo } = hydrateParticipants({
    participantsProfile,
    policyDefinitions,
    tournamentRecord,
    contextProfile,
    inContext,
  });

  if (contextProfile && !contextContent)
    contextContent = getContextContent({
      policyDefinitions,
      tournamentRecord,
      contextProfile,
    });

  const { appliedPolicies: tournamentAppliedPolicies } = getAppliedPolicies({
    tournamentRecord,
  });
  const filteredEventIds = contextFilters?.eventIds ?? [];
  const eventsDrawsMatchUps = events
    .filter((event) => !filteredEventIds.includes(event.eventId))
    .map((event) => {
      const flightProfile = getFlightProfile({ event }).flightProfile;
      const additionalContext = {
        eventDrawsCount: flightProfile?.flights?.length || event.drawDefinitions?.length || 0,
        ...context,
      };

      return eventMatchUps({
        hydrateParticipants: params.hydrateParticipants,
        context: additionalContext,
        tournamentAppliedPolicies,
        scheduleVisibilityFilters,
        participantsProfile,
        afterRecoveryTimes,
        policyDefinitions,
        tournamentRecord,
        usePublishState,
        contextFilters,
        contextProfile,
        contextContent,
        matchUpFilters,
        participantMap,
        participants,
        tournamentId,
        nextMatchUps,
        inContext,
        event,
      });
    });

  const eventsDrawMatchUpsResult = eventsDrawsMatchUps.reduce(
    (matchUps, eventMatchUps) => {
      const keys =
        eventMatchUps && Object.keys(eventMatchUps).filter((key) => !['success', 'matchUpsMap'].includes(key));
      keys?.forEach((key) => {
        if (Array.isArray(eventMatchUps[key])) {
          if (!matchUps[key]) matchUps[key] = [];
          matchUps[key] = matchUps[key].concat(eventMatchUps[key]);
          if (matchUps.matchUpsCount !== undefined) {
            matchUps.matchUpsCount += eventMatchUps[key].length;
          } else {
            matchUps.matchUpsCount = eventMatchUps[key].length;
          }
        }
      });

      return matchUps;
    },
    { matchUpsCount: 0 },
  );

  // Emission boundary. `participants` above is the hydrated, UNFILTERED array that context assembly
  // needs (scale values read `timeItems`, participant resolution reads `personId`); the copy that
  // leaves the engine is the one a supplied privacy policy governs. `getCompetitionMatchUps` folds
  // this array into `mappedParticipants`, which `competitionScheduleMatchUps` returns to public
  // callers, so an unfiltered array here is an unfiltered public payload.
  const template = getParticipantPrivacyTemplate(policyDefinitions);

  return {
    ...eventsDrawMatchUpsResult,
    participants: applyParticipantPrivacy({ participants, template }),
    groupInfo,
  };
}
