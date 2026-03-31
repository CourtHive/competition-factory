// Constants
import { MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord, SanctioningPolicy } from '@Types/sanctioningTypes';

type GetCompletenessArgs = {
  sanctioningRecord: SanctioningRecord;
  sanctioningPolicy?: SanctioningPolicy;
};

type CompletenessResult = {
  score: number;
  totalFields: number;
  completedFields: number;
  missingFields: string[];
};

// Check that a value is meaningfully present (not undefined/null/empty string)
function isPresent(value: any): boolean {
  if (value === undefined || value === null) return false;
  if (typeof value === 'string') return value.trim().length > 0;
  if (typeof value === 'number') return true; // 0 is a valid value
  if (typeof value === 'boolean') return true; // false is a valid value
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === 'object') return true;
  return !!value;
}

export function getCompleteness({ sanctioningRecord, sanctioningPolicy }: GetCompletenessArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const { proposal, applicant, endorsement } = sanctioningRecord;
  const missingFields: string[] = [];

  // Core proposal fields (required)
  const coreChecks: [string, any][] = [
    ['proposal.tournamentName', proposal?.tournamentName],
    ['proposal.proposedStartDate', proposal?.proposedStartDate],
    ['proposal.proposedEndDate', proposal?.proposedEndDate],
    ['proposal.events', proposal?.events?.length],
    ['applicant.organisationName', applicant?.organisationName],
    ['applicant.contactName', applicant?.contactName],
    ['applicant.contactEmail', applicant?.contactEmail],
  ];

  // Optional but important fields
  const optionalChecks: [string, any][] = [
    ['proposal.hostCountryCode', proposal?.hostCountryCode],
    ['proposal.surfaceCategory', proposal?.surfaceCategory],
    ['proposal.indoorOutdoor', proposal?.indoorOutdoor],
    ['proposal.venues', proposal?.venues?.length],
    ['proposal.tournamentDirector', proposal?.tournamentDirector?.personName],
    ['proposal.referee', proposal?.referee?.personName],
    ['proposal.totalPrizeMoney', proposal?.totalPrizeMoney?.length],
  ];

  // Policy-driven checks
  const policyChecks: [string, any][] = [];
  if (sanctioningPolicy) {
    if (sanctioningPolicy.requireInsurance) {
      policyChecks.push(['proposal.insuranceCertificate', proposal?.insuranceCertificate]);
    }
    if (sanctioningPolicy.requireSafetyPlan) {
      policyChecks.push(['proposal.safetyPlan', proposal?.safetyPlan]);
    }
    if (sanctioningPolicy.requireMedicalPlan) {
      policyChecks.push(['proposal.medicalPlan', proposal?.medicalPlan]);
    }
    if (sanctioningPolicy.requireEndorsement) {
      policyChecks.push(['endorsement', endorsement?.status === 'ENDORSED' || endorsement?.status === 'NOT_REQUIRED']);
    }
    if (sanctioningPolicy.requireAntiCorruption) {
      policyChecks.push(['proposal.antiCorruptionCompliance', proposal?.antiCorruptionCompliance]);
    }
    if (sanctioningPolicy.requireSafeguarding) {
      policyChecks.push(['proposal.safeguardingCompliance', proposal?.safeguardingCompliance]);
    }
  }

  const allChecks = [...coreChecks, ...optionalChecks, ...policyChecks];
  let completed = 0;
  for (const [field, value] of allChecks) {
    if (isPresent(value)) {
      completed++;
    } else {
      missingFields.push(field);
    }
  }

  const score = allChecks.length > 0 ? Math.round((completed / allChecks.length) * 100) : 0;

  const completeness: CompletenessResult = {
    score,
    totalFields: allChecks.length,
    completedFields: completed,
    missingFields,
  };

  return { ...SUCCESS, completeness };
}
