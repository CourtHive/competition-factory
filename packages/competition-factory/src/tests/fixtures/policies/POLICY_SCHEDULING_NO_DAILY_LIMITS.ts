import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { DOUBLES } from '@Constants/matchUpTypes';

/**
 *
 */
export const POLICY_SCHEDULING_NO_DAILY_LIMITS = {
  [POLICY_TYPE_SCHEDULING]: {
    defaultTimes: {
      averageTimes: [{ categoryNames: [], minutes: { default: 90 } }],
      recoveryTimes: [{ minutes: { [DOUBLES]: 30, default: 60 } }],
    },
  },
};

export default POLICY_SCHEDULING_NO_DAILY_LIMITS;
