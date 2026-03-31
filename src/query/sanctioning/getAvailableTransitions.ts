// Constants
import { VALID_STATUS_TRANSITIONS, MISSING_SANCTIONING_RECORD } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningRecord, SanctioningStatus } from '@Types/sanctioningTypes';

type GetAvailableTransitionsArgs = {
  sanctioningRecord: SanctioningRecord;
};

export function getAvailableTransitions({ sanctioningRecord }: GetAvailableTransitionsArgs): {
  error?: any;
  success?: boolean;
  availableTransitions?: SanctioningStatus[];
} {
  if (!sanctioningRecord) return { error: MISSING_SANCTIONING_RECORD };

  const availableTransitions = VALID_STATUS_TRANSITIONS[sanctioningRecord.status] ?? [];

  return { ...SUCCESS, availableTransitions: [...availableTransitions] };
}
