import { hydrateRoundNames } from '@Generators/drawDefinitions/generateDrawDefinition/hydrateRoundNames';

// constants
import { MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { POLICY_TYPE_ROUND_NAMING } from '@Constants/policyConstants';

export function hydrateTournamentRecord(params) {
  const { tournamentRecord, eventProfiles = [], directives, policyDefinitions } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const events = tournamentRecord.events ?? [];

  events.forEach((event) => {
    const eventProfile = eventProfiles.find((ep) => ep.eventId && ep.eventId === event.eventId);
    if (eventProfile?.directives?.hydrateRoundNames || directives?.hydrateRoundNames) {
      event.drawDefinitions?.forEach((drawDefinition) => {
        const roundNamingPolicy =
          eventProfile?.policyDefinitions?.[POLICY_TYPE_ROUND_NAMING] || policyDefinitions?.[POLICY_TYPE_ROUND_NAMING];
        if (roundNamingPolicy) hydrateRoundNames({ drawDefinition, appliedPolicies: policyDefinitions });
      });
    }
  });

  return { tournamentRecord };
}
