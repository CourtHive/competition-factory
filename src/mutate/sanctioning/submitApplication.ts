import { transitionStatus } from './transitionStatus';

// Constants
import {
  MISSING_SANCTIONING_RECORD,
  ENDORSEMENT_REQUIRED,
  OUTSTANDING_COMPLIANCE,
  SUBMITTED,
} from '@Constants/sanctioningConstants';

// Types
import type { SanctioningRecord, SanctioningPolicy } from '@Types/sanctioningTypes';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

type SubmitApplicationArgs = {
  sanctioningRecord: SanctioningRecord;
  sanctioningPolicy?: SanctioningPolicy;
  priorSanctioningRecords?: SanctioningRecord[];
  submittedBy?: string;
};

export function submitApplication({
  sanctioningRecord,
  sanctioningPolicy,
  priorSanctioningRecords,
  submittedBy,
}: SubmitApplicationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  // Check prior compliance gate — block if applicant has outstanding compliance from earlier events
  if (priorSanctioningRecords?.length) {
    const hasOutstanding = priorSanctioningRecords.some(
      (r) =>
        r.compliance?.status === 'ISSUES_FLAGGED' ||
        r.compliance?.items?.some((i) => i.status === 'OVERDUE' && i.required),
    );
    if (hasOutstanding) return { error: OUTSTANDING_COMPLIANCE };
  }

  // Check endorsement gate if policy requires it
  const requireEndorsement = sanctioningPolicy?.requireEndorsement ?? false;
  if (requireEndorsement) {
    const requiredCount = sanctioningPolicy?.requiredEndorsementCount ?? 1;
    const endorsements = sanctioningRecord.endorsements ?? (sanctioningRecord.endorsement ? [sanctioningRecord.endorsement] : []);
    const endorsedCount = endorsements.filter(
      (e) => e.status === 'ENDORSED' || e.status === 'NOT_REQUIRED',
    ).length;
    if (endorsedCount < requiredCount) {
      return { error: ENDORSEMENT_REQUIRED };
    }
  }

  const result = transitionStatus({
    sanctioningRecord,
    toStatus: SUBMITTED,
    transitionedBy: submittedBy,
    reason: 'Application submitted',
  });
  if (result.error) return result;

  sanctioningRecord.submittedAt = sanctioningRecord.updatedAt;

  // Snapshot policy version at submission time
  if (sanctioningPolicy) {
    sanctioningRecord.policyVersion = sanctioningPolicy.policyVersion;
    sanctioningRecord.policySnapshot = makeDeepCopy(sanctioningPolicy, false, true);
  }

  return result;
}
