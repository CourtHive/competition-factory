import { transitionStatus } from './transitionStatus';

// Constants
import { MISSING_SANCTIONING_RECORD, REJECTED } from '@Constants/sanctioningConstants';

// Types
import type { SanctioningRecord } from '@Types/sanctioningTypes';

type RejectApplicationArgs = {
  sanctioningRecord: SanctioningRecord;
  rejectedBy?: string;
  reason?: string;
};

export function rejectApplication({ sanctioningRecord, rejectedBy, reason }: RejectApplicationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  return transitionStatus({
    sanctioningRecord,
    toStatus: REJECTED,
    transitionedBy: rejectedBy,
    reason: reason ?? 'Application rejected',
  });
}
