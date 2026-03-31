// Constants
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord } from '@Types/officiatingTypes';

type GetEvaluationSummaryArgs = {
  officialRecord: OfficialRecord;
  policyName?: string;
  approvedOnly?: boolean;
};

export interface EvaluationSummary {
  evaluationCount: number;
  averageRating: number;
  latestRating?: number;
  latestDate?: string;
  sectionAverages?: { sectionId: string; sectionName: string; average: number }[];
  meetsThreshold?: boolean;
}

export function getEvaluationSummary({ officialRecord, policyName, approvedOnly = true }: GetEvaluationSummaryArgs): {
  error?: any;
  success?: boolean;
  summary?: EvaluationSummary;
} {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };

  let evaluations = officialRecord.evaluations;

  if (approvedOnly) {
    evaluations = evaluations.filter((e) => e.status === 'APPROVED');
  }

  if (evaluations.length === 0) {
    return {
      ...SUCCESS,
      summary: { evaluationCount: 0, averageRating: 0 },
    };
  }

  const ratings = evaluations.map((e) => e.overallRating);
  const averageRating = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;

  const sorted = [...evaluations].sort((a, b) => (b.evaluationDate > a.evaluationDate ? 1 : -1));
  const latest = sorted[0];

  const summary: EvaluationSummary = {
    evaluationCount: evaluations.length,
    averageRating: Math.round(averageRating * 100) / 100,
    latestRating: latest.overallRating,
    latestDate: latest.evaluationDate,
  };

  // Compute section averages if a policy is specified
  if (policyName) {
    const policy = officialRecord.evaluationPolicies.find((p) => p.policyName === policyName);
    if (policy) {
      const policyEvals = evaluations.filter((e) => e.policyName === policyName);
      if (policyEvals.length > 0) {
        summary.sectionAverages = policy.sections.map((section) => {
          const criterionIds = new Set(section.criteria.map((c) => c.criterionId));
          const sectionScores: number[] = [];

          for (const evaluation of policyEvals) {
            const sectionValues = evaluation.scores
              .filter((s) => criterionIds.has(s.criterionId) && typeof s.value === 'number')
              .map((s) => s.value as number);

            if (sectionValues.length > 0) {
              sectionScores.push(sectionValues.reduce((sum, v) => sum + v, 0) / sectionValues.length);
            }
          }

          return {
            sectionId: section.sectionId,
            sectionName: section.sectionName,
            average:
              sectionScores.length > 0
                ? Math.round((sectionScores.reduce((sum, v) => sum + v, 0) / sectionScores.length) * 100) / 100
                : 0,
          };
        });

        if (policy.passingThreshold !== undefined) {
          summary.meetsThreshold = summary.averageRating >= policy.passingThreshold;
        }
      }
    }
  }

  return { ...SUCCESS, summary };
}
