// Constants
import { MISSING_OFFICIAL_RECORD, MISSING_EVALUATION_POLICY } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, EvaluationPolicy, EvaluationFormField } from '@Types/officiatingTypes';

type GetEvaluationTemplateArgs = {
  officialRecord?: OfficialRecord;
  policyName?: string;
  evaluationPolicy?: EvaluationPolicy;
};

export function getEvaluationTemplate({
  officialRecord,
  policyName,
  evaluationPolicy,
}: GetEvaluationTemplateArgs): {
  error?: any;
  success?: boolean;
  fields?: EvaluationFormField[];
  evaluationPolicy?: EvaluationPolicy;
} {
  let policy = evaluationPolicy;

  if (!policy && policyName) {
    if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
    policy = officialRecord.evaluationPolicies.find((p) => p.policyName === policyName);
  }

  if (!policy) {
    if (policyName) return { error: MISSING_EVALUATION_POLICY, context: { policyName } } as any;
    return { error: INVALID_VALUES, context: { message: 'Missing evaluationPolicy or policyName' } } as any;
  }

  const fields: EvaluationFormField[] = [];

  for (const section of policy.sections) {
    for (const criterion of section.criteria) {
      fields.push({
        fieldId: `${section.sectionId}.${criterion.criterionId}`,
        sectionId: section.sectionId,
        sectionName: section.sectionName,
        criterionId: criterion.criterionId,
        criterionName: criterion.criterionName,
        description: criterion.description,
        scoringType: criterion.scoringType,
        scaleOptions: criterion.scaleOptions,
        numericRange: criterion.numericRange,
        required: criterion.required,
        weight: criterion.weight,
        sectionWeight: section.weight,
      });
    }
  }

  return { ...SUCCESS, fields, evaluationPolicy: policy };
}
