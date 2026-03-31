// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  MISSING_OFFICIAL_RECORD,
  EVALUATION_NOT_FOUND,
  EVALUATION_NOT_EDITABLE,
  EVALUATION_EDITABLE,
} from '@Constants/officiatingConstants';

// Types
import type { OfficialRecord, OfficialEvaluation, EvaluationScore } from '@Types/officiatingTypes';

type ModifyEvaluationArgs = {
  officialRecord: OfficialRecord;
  evaluationId: string;
  updates: Partial<
    Pick<
      OfficialEvaluation,
      | 'overallRating'
      | 'comments'
      | 'documentReference'
      | 'tournamentId'
      | 'tournamentName'
      | 'matchUpId'
      | 'policyName'
      | 'extensions'
    > & { scores?: EvaluationScore[] }
  >;
};

export function modifyEvaluation({ officialRecord, evaluationId, updates }: ModifyEvaluationArgs): {
  error?: any;
  evaluation?: OfficialEvaluation;
  success?: boolean;
} {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!evaluationId) return { error: INVALID_VALUES, context: { message: 'Missing evaluationId' } } as any;

  const evaluation = officialRecord.evaluations.find((e) => e.evaluationId === evaluationId);
  if (!evaluation) return { error: EVALUATION_NOT_FOUND, context: { evaluationId } } as any;

  if (!EVALUATION_EDITABLE.includes(evaluation.status)) {
    return { error: EVALUATION_NOT_EDITABLE, context: { status: evaluation.status } } as any;
  }

  if (updates.overallRating !== undefined) evaluation.overallRating = updates.overallRating;
  if (updates.scores !== undefined) evaluation.scores = updates.scores;
  if (updates.comments !== undefined) evaluation.comments = updates.comments;
  if (updates.documentReference !== undefined) evaluation.documentReference = updates.documentReference;
  if (updates.tournamentId !== undefined) evaluation.tournamentId = updates.tournamentId;
  if (updates.tournamentName !== undefined) evaluation.tournamentName = updates.tournamentName;
  if (updates.matchUpId !== undefined) evaluation.matchUpId = updates.matchUpId;
  if (updates.policyName !== undefined) evaluation.policyName = updates.policyName;
  if (updates.extensions !== undefined) evaluation.extensions = updates.extensions;

  officialRecord.updatedAt = new Date().toISOString();

  return { ...SUCCESS, evaluation };
}
