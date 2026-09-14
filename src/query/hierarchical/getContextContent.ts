import { getPolicyDefinitions } from '@Query/extensions/getAppliedPolicies';

import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { ContextProfile, PolicyDefinitions } from '@Types/factoryTypes';

type GetContextContentArgs = {
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  contextProfile?: ContextProfile;
  event?: Event;
};
export function getContextContent({
  policyDefinitions,
  tournamentRecord,
  contextProfile,
  drawDefinition,
  event,
}: GetContextContentArgs) {
  const contextContent = { policies: {} };

  if (!contextProfile) return contextContent;

  const policies = getPolicyDefinitions({
    tournamentRecord,
    drawDefinition,
    event,
  }).policyDefinitions;

  if (contextProfile.withCompetitiveness) {
    const policy =
      policyDefinitions?.[POLICY_TYPE_COMPETITIVE_BANDS] ??
      policies?.[POLICY_TYPE_COMPETITIVE_BANDS] ??
      POLICY_COMPETITIVE_BANDS_DEFAULT[POLICY_TYPE_COMPETITIVE_BANDS];

    contextContent.policies[POLICY_TYPE_COMPETITIVE_BANDS] = policy;
  }

  return contextContent;
}
