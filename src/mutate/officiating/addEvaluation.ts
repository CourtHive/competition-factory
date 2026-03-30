import { UUID } from '@Tools/UUID';

// Constants
import { MISSING_OFFICIAL_RECORD, EVAL_DRAFT } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialEvaluation, EvaluationScore } from '@Types/officiatingTypes';

type AddEvaluationArgs = {
  officialRecord: OfficialRecord;
  evaluationId?: string;
  evaluatorPersonId: string;
  subjectPersonId?: string;
  tournamentId?: string;
  tournamentName?: string;
  matchUpId?: string;
  evaluationDate?: string;
  overallRating: number;
  policyName?: string;
  scores?: EvaluationScore[];
  comments?: string;
  documentReference?: any;
  extensions?: any[];
};

export function addEvaluation({
  officialRecord,
  evaluationId,
  evaluatorPersonId,
  subjectPersonId,
  tournamentId,
  tournamentName,
  matchUpId,
  evaluationDate,
  overallRating,
  policyName,
  scores,
  comments,
  documentReference,
  extensions,
}: AddEvaluationArgs): { error?: any; evaluation?: OfficialEvaluation; success?: boolean } {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!evaluatorPersonId) return { error: INVALID_VALUES, context: { message: 'Missing evaluatorPersonId' } } as any;
  if (overallRating === undefined || overallRating === null)
    return { error: INVALID_VALUES, context: { message: 'Missing overallRating' } } as any;
  if (typeof overallRating !== 'number' || overallRating < 0)
    return { error: INVALID_VALUES, context: { message: 'overallRating must be a non-negative number' } } as any;

  const now = new Date().toISOString();

  const evaluation: OfficialEvaluation = {
    evaluationId: evaluationId || UUID(),
    evaluatorPersonId,
    subjectPersonId: subjectPersonId ?? officialRecord.personId,
    tournamentId,
    tournamentName,
    matchUpId,
    evaluationDate: evaluationDate ?? now.split('T')[0],
    overallRating,
    status: EVAL_DRAFT,
    policyName,
    scores: scores ?? [],
    comments,
    documentReference,
    statusHistory: [
      {
        fromStatus: EVAL_DRAFT,
        toStatus: EVAL_DRAFT,
        transitionedAt: now,
        reason: 'Evaluation created',
      },
    ],
    extensions: extensions ?? [],
  };

  officialRecord.evaluations.push(evaluation);
  officialRecord.updatedAt = now;

  return { ...SUCCESS, evaluation };
}
