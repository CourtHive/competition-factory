// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_OFFICIAL_RECORD,
  EVALUATION_NOT_FOUND,
  INVALID_OFFICIATING_STATUS_TRANSITION,
  VALID_EVALUATION_TRANSITIONS,
  INVALID_EVALUATION_SCORES,
  EVAL_SUBMITTED,
} from '@Constants/officiatingConstants';

// Types
import type { OfficialRecord, EvaluationStatus, OfficialEvaluation } from '@Types/officiatingTypes';

type TransitionEvaluationStatusArgs = {
  officialRecord: OfficialRecord;
  evaluationId: string;
  toStatus: EvaluationStatus;
  transitionedBy?: string;
  reason?: string;
};

export function transitionEvaluationStatus({
  officialRecord,
  evaluationId,
  toStatus,
  transitionedBy,
  reason,
}: TransitionEvaluationStatusArgs): { error?: any; evaluation?: OfficialEvaluation; success?: boolean } {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!evaluationId) return { error: INVALID_VALUES, context: { message: 'Missing evaluationId' } } as any;
  if (!toStatus) return { error: INVALID_VALUES, context: { message: 'Missing toStatus' } } as any;

  const evaluation = officialRecord.evaluations.find((e) => e.evaluationId === evaluationId);
  if (!evaluation) return { error: EVALUATION_NOT_FOUND, context: { evaluationId } } as any;

  const validTargets = VALID_EVALUATION_TRANSITIONS[evaluation.status];
  if (!validTargets?.includes(toStatus)) {
    return {
      error: INVALID_OFFICIATING_STATUS_TRANSITION,
      context: { fromStatus: evaluation.status, toStatus, validTargets },
    } as any;
  }

  // When submitting, validate that policy-required scores are present
  if (toStatus === EVAL_SUBMITTED && evaluation.policyName) {
    const policy = officialRecord.evaluationPolicies.find((p) => p.policyName === evaluation.policyName);
    if (policy) {
      const requiredCriteria = policy.sections.flatMap((s) => s.criteria.filter((c) => c.required));
      const scoredIds = new Set(evaluation.scores.map((s) => s.criterionId));
      const missing = requiredCriteria.filter((c) => !scoredIds.has(c.criterionId));
      if (missing.length > 0) {
        return {
          error: INVALID_EVALUATION_SCORES,
          context: { missingCriteria: missing.map((c) => c.criterionId) },
        } as any;
      }
    }
  }

  const now = new Date().toISOString();

  evaluation.statusHistory ??= [];
  evaluation.statusHistory.push({
    fromStatus: evaluation.status,
    toStatus,
    transitionedAt: now,
    transitionedBy,
    reason,
  });

  evaluation.status = toStatus;
  officialRecord.updatedAt = now;

  return { ...SUCCESS, evaluation };
}
