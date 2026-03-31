// Constants
import { VALID_STATUS_TRANSITIONS, INVALID_STATUS_TRANSITION } from '@Constants/sanctioningConstants';
import { SUCCESS } from '@Constants/resultConstants';

// Types
import type { SanctioningStatus } from '@Types/sanctioningTypes';

type ValidateStatusTransitionArgs = {
  fromStatus: SanctioningStatus;
  toStatus: SanctioningStatus;
};

export function validateStatusTransition({ fromStatus, toStatus }: ValidateStatusTransitionArgs) {
  const validTargets = VALID_STATUS_TRANSITIONS[fromStatus];

  if (!validTargets) {
    return {
      error: INVALID_STATUS_TRANSITION,
      context: { fromStatus, message: `Unknown status: ${fromStatus}` },
    };
  }

  if (!validTargets.includes(toStatus)) {
    return {
      error: INVALID_STATUS_TRANSITION,
      context: { fromStatus, toStatus, validTargets },
    };
  }

  return { ...SUCCESS, valid: true };
}
