// Constants
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord, OfficialEvaluation, EvaluationStatus } from '@Types/officiatingTypes';

type GetEvaluationsArgs = {
  officialRecord: OfficialRecord;
  evaluatorPersonId?: string;
  status?: EvaluationStatus;
  tournamentId?: string;
  policyName?: string;
};

export function getEvaluations({
  officialRecord,
  evaluatorPersonId,
  status,
  tournamentId,
  policyName,
}: GetEvaluationsArgs): {
  error?: any;
  success?: boolean;
  evaluations?: OfficialEvaluation[];
} {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };

  let evaluations = [...officialRecord.evaluations];

  if (evaluatorPersonId) {
    evaluations = evaluations.filter((e) => e.evaluatorPersonId === evaluatorPersonId);
  }
  if (status) {
    evaluations = evaluations.filter((e) => e.status === status);
  }
  if (tournamentId) {
    evaluations = evaluations.filter((e) => e.tournamentId === tournamentId);
  }
  if (policyName) {
    evaluations = evaluations.filter((e) => e.policyName === policyName);
  }

  return { ...SUCCESS, evaluations };
}
