// Constants
import { MISSING_OFFICIAL_RECORD } from '@Constants/officiatingConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { OfficialRecord } from '@Types/officiatingTypes';

type GetOfficialEligibilityArgs = {
  officialRecord: OfficialRecord;
  certificationFamily: string;
  certificationLevel?: string;
  organisationId?: string;
  asOfDate?: string;
};

export function getOfficialEligibility({
  officialRecord,
  certificationFamily,
  certificationLevel,
  organisationId,
  asOfDate,
}: GetOfficialEligibilityArgs): {
  error?: any;
  success?: boolean;
  eligible?: boolean;
  reasons?: string[];
} {
  if (!officialRecord) return { error: MISSING_OFFICIAL_RECORD };

  const reasons: string[] = [];
  const checkDate = asOfDate ?? new Date().toISOString().split('T')[0];

  // Check for active suspensions
  const activeSuspensions = officialRecord.suspensions.filter((s) => {
    const from = s.suspendedFrom ?? '0000-00-00';
    const until = s.suspendedUntil ?? '9999-12-31';
    return from <= checkDate && until >= checkDate;
  });

  if (activeSuspensions.length > 0) {
    reasons.push('Official has active suspension(s)');
  }

  // Check for matching active certification
  let matchingCerts = officialRecord.certifications.filter(
    (c) => c.certificationFamily === certificationFamily && c.status === 'ACTIVE',
  );

  if (organisationId) {
    matchingCerts = matchingCerts.filter((c) => c.organisationId === organisationId);
  }

  if (certificationLevel) {
    matchingCerts = matchingCerts.filter((c) => c.certificationLevel === certificationLevel);
  }

  if (matchingCerts.length === 0) {
    const levelSuffix = certificationLevel ? ` ${certificationLevel}` : '';
    reasons.push(`No active ${certificationFamily}${levelSuffix} certification`);
  }

  // Check expiry on matching certs
  const validCerts = matchingCerts.filter((c) => {
    if (c.validUntil && c.validUntil < checkDate) return false;
    if (c.validFrom && c.validFrom > checkDate) return false;
    return true;
  });

  if (matchingCerts.length > 0 && validCerts.length === 0) {
    reasons.push('Matching certification(s) are expired or not yet valid');
  }

  // Check certification requirements if defined
  if (certificationLevel) {
    const requirement = officialRecord.certificationRequirements.find(
      (r) =>
        r.certificationFamily === certificationFamily &&
        r.certificationLevel === certificationLevel &&
        (!organisationId || r.organisationId === organisationId),
    );

    if (requirement) {
      // Check minimum assignments
      if (requirement.minimumAssignments !== undefined) {
        const completedAssignments = officialRecord.assignments.filter((a) => a.status === 'COMPLETED');
        if (completedAssignments.length < requirement.minimumAssignments) {
          reasons.push(
            `Insufficient completed assignments: ${completedAssignments.length}/${requirement.minimumAssignments}`,
          );
        }
      }

      // Check minimum evaluation score
      if (requirement.minimumEvaluationScore !== undefined) {
        const approvedEvals = officialRecord.evaluations.filter((e) => e.status === 'APPROVED');
        if (approvedEvals.length === 0) {
          reasons.push('No approved evaluations');
        } else {
          const avgRating = approvedEvals.reduce((sum, e) => sum + e.overallRating, 0) / approvedEvals.length;
          if (avgRating < requirement.minimumEvaluationScore) {
            reasons.push(
              `Average evaluation score ${avgRating.toFixed(2)} below minimum ${requirement.minimumEvaluationScore}`,
            );
          }
        }
      }

      // Check prerequisite levels
      if (requirement.prerequisiteLevels?.length) {
        const hasPrerequisite = requirement.prerequisiteLevels.some((prereqLevel) =>
          officialRecord.certifications.some(
            (c) =>
              c.certificationFamily === certificationFamily &&
              c.certificationLevel === prereqLevel &&
              (c.status === 'ACTIVE' || c.status === 'EXPIRED'),
          ),
        );
        if (!hasPrerequisite) {
          reasons.push(`Missing prerequisite certification level: ${requirement.prerequisiteLevels.join(' or ')}`);
        }
      }
    }
  }

  const eligible = reasons.length === 0;

  return { ...SUCCESS, eligible, reasons };
}
