import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';

import POLICY_COMPETITIVE_BANDS_DEFAULT from '@Fixtures/policies/POLICY_COMPETITIVE_BANDS_DEFAULT';
import { POLICY_TYPE_COMPETITIVE_BANDS } from '@Constants/policyConstants';
import { PolicyDefinitions } from '@Types/factoryTypes';
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';

type ResolveCompetitiveBandsArgs = {
  policyDefinitions?: PolicyDefinitions;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  structure?: Structure;
  event?: Event;
};

export function resolveCompetitiveBands({
  policyDefinitions,
  tournamentRecord,
  drawDefinition,
  structure,
  event,
}: ResolveCompetitiveBandsArgs) {
  const explicit = policyDefinitions?.[POLICY_TYPE_COMPETITIVE_BANDS];
  if (explicit?.profileBands) return explicit.profileBands;

  if (tournamentRecord) {
    const { appliedPolicies } = getAppliedPolicies({
      tournamentRecord,
      drawDefinition,
      structure,
      event,
    });
    const applied = appliedPolicies?.[POLICY_TYPE_COMPETITIVE_BANDS];
    if (applied?.profileBands) return applied.profileBands;
  }

  return POLICY_COMPETITIVE_BANDS_DEFAULT[POLICY_TYPE_COMPETITIVE_BANDS].profileBands;
}
