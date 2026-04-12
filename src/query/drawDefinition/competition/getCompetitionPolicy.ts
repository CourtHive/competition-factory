// Query
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';

// Constants
import { POLICY_TYPE_COMPETITION } from '@Constants/policyConstants';

// Types
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import type { CompetitionPolicy } from '@Types/competitionPolicyTypes';
import type { ResultType } from '@Types/factoryTypes';

type GetCompetitionPolicyArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  event?: Event;
};

type GetCompetitionPolicyResult = ResultType & {
  competitionPolicy?: CompetitionPolicy;
};

export function getCompetitionPolicy(params: GetCompetitionPolicyArgs): GetCompetitionPolicyResult {
  const { appliedPolicies } = getAppliedPolicies({
    tournamentRecord: params.tournamentRecord,
    drawDefinition: params.drawDefinition,
    event: params.event,
  });

  const competitionPolicy = appliedPolicies?.[POLICY_TYPE_COMPETITION] as CompetitionPolicy | undefined;
  return { competitionPolicy };
}
