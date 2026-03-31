import { transitionStatus } from './transitionStatus';

// Constants
import { MISSING_SANCTIONING_RECORD, WITHDRAWN } from '@Constants/sanctioningConstants';

// Types
import type { SanctioningRecord } from '@Types/sanctioningTypes';

type WithdrawApplicationArgs = {
  sanctioningRecord: SanctioningRecord;
  withdrawnBy?: string;
  reason?: string;
};

export function withdrawApplication({ sanctioningRecord, withdrawnBy, reason }: WithdrawApplicationArgs) {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  return transitionStatus({
    sanctioningRecord,
    toStatus: WITHDRAWN,
    transitionedBy: withdrawnBy,
    reason: reason ?? 'Application withdrawn',
  });
}
