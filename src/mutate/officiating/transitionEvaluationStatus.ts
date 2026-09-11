import { transitionRecordStatus } from '@Functions/declaration/transitionRecordStatus';

// constants and types
import {
  MISSING_OFFICIAL_RECORD,
  EVALUATION_NOT_FOUND,
  INVALID_OFFICIATING_STATUS_TRANSITION,
  VALID_EVALUATION_TRANSITIONS,
  INVALID_EVALUATION_SCORES,
  EVAL_SUBMITTED,
} from '@Constants/officiatingConstants';
import type { OfficialRecord, EvaluationStatus, OfficialEvaluation } from '@Types/officiatingTypes';

type TransitionEvaluationStatusArgs = {
  officialRecord: OfficialRecord;
  evaluationId: string;
  toStatus: EvaluationStatus;
  transitionedBy?: string;
  reason?: string;
};

// When submitting, validate that policy-required scores are present.
function checkEvaluationSubmissionScores({ record, entity, toStatus }: { record: any; entity: any; toStatus: string }) {
  if (toStatus !== EVAL_SUBMITTED || !entity.policyName) return undefined;
  const policy = record.evaluationPolicies.find((p: any) => p.policyName === entity.policyName);
  if (!policy) return undefined;

  const requiredCriteria = policy.sections.flatMap((s: any) => s.criteria.filter((c: any) => c.required));
  const scoredIds = new Set(entity.scores.map((s: any) => s.criterionId));
  const missing = requiredCriteria.filter((c: any) => !scoredIds.has(c.criterionId));
  if (!missing.length) return undefined;

  return { error: INVALID_EVALUATION_SCORES, context: { missingCriteria: missing.map((c: any) => c.criterionId) } };
}

export function transitionEvaluationStatus({
  officialRecord,
  evaluationId,
  toStatus,
  transitionedBy,
  reason,
}: TransitionEvaluationStatusArgs): { error?: any; evaluation?: OfficialEvaluation; success?: boolean } {
  return transitionRecordStatus({
    record: officialRecord,
    collectionKey: 'evaluations',
    idKey: 'evaluationId',
    entityId: evaluationId,
    toStatus,
    transitionedBy,
    reason,
    machineDef: VALID_EVALUATION_TRANSITIONS,
    resultKey: 'evaluation',
    errors: {
      missingRecord: MISSING_OFFICIAL_RECORD,
      notFound: EVALUATION_NOT_FOUND,
      invalidTransition: INVALID_OFFICIATING_STATUS_TRANSITION,
    },
    preTransition: checkEvaluationSubmissionScores,
  });
}
