import { transitionStatus } from './transitionStatus';

// Constants
import { MISSING_SANCTIONING_RECORD, UNDER_REVIEW } from '@Constants/sanctioningConstants';

// Types
import type { SanctioningRecord, Reviewer } from '@Types/sanctioningTypes';

type ReviewApplicationArgs = {
  sanctioningRecord: SanctioningRecord;
  reviewer?: Reviewer;
};

export function reviewApplication({ sanctioningRecord, reviewer }: ReviewApplicationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const result = transitionStatus({
    sanctioningRecord,
    toStatus: UNDER_REVIEW,
    transitionedBy: reviewer?.reviewerName,
    reason: 'Application under review',
  });
  if (result.error) return result;

  if (reviewer) sanctioningRecord.reviewer = reviewer;
  sanctioningRecord.reviewedAt = sanctioningRecord.updatedAt;

  return result;
}
