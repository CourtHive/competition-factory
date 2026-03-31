import { makeDeepCopy } from '@Tools/makeDeepCopy';

// Constants
import { MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord, StatusTransition } from '@Types/sanctioningTypes';

type GetStatusHistoryArgs = {
  sanctioningRecord: SanctioningRecord;
};

export function getStatusHistory({ sanctioningRecord }: GetStatusHistoryArgs): {
  error?: any;
  success?: boolean;
  statusHistory?: StatusTransition[];
} {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const statusHistory = makeDeepCopy(sanctioningRecord.statusHistory ?? [], false, true);

  return { ...SUCCESS, statusHistory };
}
