// Constants
import { POLICY_TYPE_COMPETITION } from '@Constants/policyConstants';

// Types
import type { CompetitionPolicy } from '@Types/competitionPolicyTypes';

export const POLICY_COMPETITION_PRESSURE = {
  [POLICY_TYPE_COMPETITION]: {
    policyName: 'Pressure DrawMatic Competition',

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
          pointDifferential: 0,
          contextFactor: 0,
        },
      },
    },

    pairingPolicy: {
      method: 'DRAW_MATIC',
      ratingSource: 'DYNAMIC_FORM',
      avoidRepeatOpponents: true,
      sameTeamValue: 100,
    },

    victoryPolicy: {
      primaryRanking: 'PRESSURE_RATING',
      tiebreakOrder: ['HEAD_TO_HEAD_PRESSURE', 'POINT_DIFFERENTIAL', 'STRENGTH_OF_OPPOSITION'],
    },

    processingGranularity: 'PER_MATCHUP',
  } satisfies CompetitionPolicy,
};
