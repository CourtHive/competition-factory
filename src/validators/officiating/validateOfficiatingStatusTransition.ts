// Constants
import { INVALID_VALUES } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  INVALID_OFFICIATING_STATUS_TRANSITION,
  VALID_CERTIFICATION_TRANSITIONS,
  VALID_EVALUATION_TRANSITIONS,
  VALID_ASSIGNMENT_TRANSITIONS,
} from '@Constants/officiatingConstants';

// Types

type ValidateOfficiatingStatusTransitionArgs = {
  entityType: 'certification' | 'evaluation' | 'assignment';
  fromStatus: string;
  toStatus: string;
};

export function validateOfficiatingStatusTransition({
  entityType,
  fromStatus,
  toStatus,
}: ValidateOfficiatingStatusTransitionArgs) {
  let transitionMap: Record<string, string[]>;

  switch (entityType) {
    case 'certification':
      transitionMap = VALID_CERTIFICATION_TRANSITIONS;
      break;
    case 'evaluation':
      transitionMap = VALID_EVALUATION_TRANSITIONS;
      break;
    case 'assignment':
      transitionMap = VALID_ASSIGNMENT_TRANSITIONS;
      break;
    default:
      return { error: INVALID_VALUES, context: { message: `Unknown entityType: ${entityType}` } };
  }

  const validTargets = transitionMap[fromStatus];

  if (!validTargets) {
    return {
      error: INVALID_OFFICIATING_STATUS_TRANSITION,
      context: { entityType, fromStatus, message: `Unknown status: ${fromStatus}` },
    };
  }

  if (!validTargets.includes(toStatus)) {
    return {
      error: INVALID_OFFICIATING_STATUS_TRANSITION,
      context: { entityType, fromStatus, toStatus, validTargets },
    };
  }

  return { ...SUCCESS, valid: true };
}
