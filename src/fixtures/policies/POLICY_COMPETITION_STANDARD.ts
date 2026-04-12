// Constants
import { POLICY_TYPE_COMPETITION } from '@Constants/policyConstants';

// Types
import type { CompetitionPolicy } from '@Types/competitionPolicyTypes';

export const POLICY_COMPETITION_STANDARD = {
  [POLICY_TYPE_COMPETITION]: {
    policyName: 'Standard DrawMatic Competition',

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
    },

    pairingPolicy: {
      method: 'DRAW_MATIC',
      ratingSource: 'DYNAMIC_FORM',
      avoidRepeatOpponents: true,
      sameTeamValue: 100,
    },

    victoryPolicy: {
      primaryRanking: 'WINS',
      tiebreakOrder: ['POINT_DIFFERENTIAL', 'HEAD_TO_HEAD', 'DYNAMIC_FORM_RATING'],
    },

    processingGranularity: 'PER_ROUND',
  } satisfies CompetitionPolicy,
};
