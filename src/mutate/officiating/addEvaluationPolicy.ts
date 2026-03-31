// Constants
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, EvaluationPolicy } from '@Types/officiatingTypes';

type AddEvaluationPolicyArgs = {
  officialRecord: OfficialRecord;
  evaluationPolicy: EvaluationPolicy;
};

export function addEvaluationPolicy({
  officialRecord,
  evaluationPolicy,
}: AddEvaluationPolicyArgs): { error?: any; evaluationPolicy?: EvaluationPolicy; success?: boolean } {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!evaluationPolicy) return { error: INVALID_VALUES, context: { message: 'Missing evaluationPolicy' } } as any;
  if (!evaluationPolicy.policyName)
    return { error: INVALID_VALUES, context: { message: 'Missing policyName' } } as any;
  if (!Array.isArray(evaluationPolicy.sections) || evaluationPolicy.sections.length === 0)
    return { error: INVALID_VALUES, context: { message: 'Policy must include at least one section' } } as any;

  officialRecord.evaluationPolicies.push(evaluationPolicy);
  officialRecord.updatedAt = new Date().toISOString();

  return { ...SUCCESS, evaluationPolicy };
}
