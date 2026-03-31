import { transitionStatus } from './transitionStatus';

// Constants
import { MISSING_SANCTIONING_RECORD, APPROVED } from '@Constants/sanctioningConstants';

import type { SanctioningRecord } from '@Types/sanctioningTypes';

type ApproveApplicationArgs = {
  sanctioningRecord: SanctioningRecord;
  approvedBy?: string;
  reason?: string;
};

export function approveApplication({ sanctioningRecord, approvedBy, reason }: ApproveApplicationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const result = transitionStatus({
    sanctioningRecord,
    toStatus: APPROVED,
    transitionedBy: approvedBy,
    reason: reason ?? 'Application approved',
  });
  if (result.error) return result;

  sanctioningRecord.approvedAt = sanctioningRecord.updatedAt;

  return result;
}
