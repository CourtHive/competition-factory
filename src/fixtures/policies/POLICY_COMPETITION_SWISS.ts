// Constants
import { POLICY_TYPE_COMPETITION } from '@Constants/policyConstants';

// Types
import type { CompetitionPolicy } from '@Types/competitionPolicyTypes';

export const POLICY_COMPETITION_SWISS = {
  [POLICY_TYPE_COMPETITION]: {
    policyName: 'Swiss Competition with Pressure',

    ratingPolicy: {
      baselineRating: {
        source: 'SCALE',
        frozenDuringEvent: true,
      },
      dynamicFormRating: {
        enabled: true,
        initializeFrom: 'BASELINE',
        kFactor: 24,
        logisticScale: 400,
      },
      pressureRating: {
        enabled: true,
        expectationSource: 'BASELINE_ONLY',
        actualOutputMethod: 'POINT_SHARE',
        weights: {
          pointShare: 1,
        },
      },
    },

    pairingPolicy: {
      method: 'SWISS',
      ratingSource: 'DYNAMIC_FORM',
      avoidRepeatOpponents: true,
    },

    victoryPolicy: {
      primaryRanking: 'WINS',
      tiebreakOrder: ['BUCHHOLZ', 'SONNEBORN_BERGER', 'HEAD_TO_HEAD', 'PRESSURE_RATING'],
    },

    processingGranularity: 'PER_ROUND',
  } satisfies CompetitionPolicy,
};
