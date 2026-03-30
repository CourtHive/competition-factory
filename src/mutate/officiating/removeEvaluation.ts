// Constants
import { MISSING_OFFICIAL_RECORD, EVALUATION_NOT_FOUND } from '@Constants/officiatingConstants';
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord } from '@Types/officiatingTypes';

type RemoveEvaluationArgs = {
  officialRecord: OfficialRecord;
  evaluationId: string;
};

export function removeEvaluation({ officialRecord, evaluationId }: RemoveEvaluationArgs) {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };
  if (!evaluationId) return { error: INVALID_VALUES, context: { message: 'Missing evaluationId' } } as any;

  const index = officialRecord.evaluations.findIndex((e) => e.evaluationId === evaluationId);
  if (index === -1) return { error: EVALUATION_NOT_FOUND, context: { evaluationId } };

  officialRecord.evaluations.splice(index, 1);
  officialRecord.updatedAt = new Date().toISOString();

  return { ...SUCCESS };
}
