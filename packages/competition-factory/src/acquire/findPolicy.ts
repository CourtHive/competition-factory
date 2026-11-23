import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORD, POLICY_NOT_FOUND } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Structure, Tournament } from '@Types/tournamentTypes';

type FindPolicyArgs = {
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  structure?: Structure;
  policyType: string;
  event?: Event;
};

export function findPolicy({ tournamentRecord, drawDefinition, policyType, structure, event }: FindPolicyArgs): {
  policy?: any;
  error?: ErrorType;
  info?: string;
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

  const { appliedPolicies } = getAppliedPolicies({
    tournamentRecord,
    drawDefinition,
    structure,
    event,
  });

  return appliedPolicies?.[policyType] ? { policy: appliedPolicies[policyType] } : { info: POLICY_NOT_FOUND?.message };
}
