// Competition Policy — static configuration attached via POLICY_TYPE_COMPETITION
export type BaselineRatingSource = 'SCALE' | 'SEEDING' | 'MANUAL';
export type ActualOutputMethod = 'POINT_SHARE' | 'WEIGHTED';
export type PairingMethod = 'DRAW_MATIC' | 'SWISS' | 'LEVEL_BASED';
export type RatingSource = 'DYNAMIC_FORM' | 'BASELINE';
export type ProcessingGranularity = 'PER_MATCHUP' | 'PER_ROUND';
export type RatingAggregation = 'AVERAGE' | 'MIN' | 'MAX' | 'SUM';

export type PrimaryRanking = 'PRESSURE_RATING' | 'DYNAMIC_FORM_RATING' | 'WINS' | 'POINTS';

export type CompetitionTiebreak =
  | 'HEAD_TO_HEAD'
  | 'HEAD_TO_HEAD_PRESSURE'
  | 'POINT_DIFFERENTIAL'
  | 'STRENGTH_OF_OPPOSITION'
  | 'DYNAMIC_FORM_RATING'
  | 'PRESSURE_RATING'
  | 'BUCHHOLZ'
  | 'SONNEBORN_BERGER';

export type CompetitionPolicy = {
  policyName?: string;

  ratingPolicy: {
    baselineRating: {
      source: BaselineRatingSource;
      scaleName?: string;
      frozenDuringEvent: true;
    };

    dynamicFormRating: {
      enabled: boolean;
      initializeFrom: 'BASELINE';
      kFactor: number;
      logisticScale: number;
    };

    pressureRating?: {
      enabled: boolean;
      expectationSource: 'BASELINE_ONLY';
      actualOutputMethod: ActualOutputMethod;
      weights?: {
        pointShare: number;
        pointDifferential?: number;
        contextFactor?: number;
      };
    };

    ratingAggregation?: RatingAggregation;
  };

  pairingPolicy: {
    method: PairingMethod;
    ratingSource: RatingSource;
    laneSize?: number;
    avoidRepeatOpponents: boolean;
    sameTeamValue?: number;
  };

  victoryPolicy: {
    primaryRanking: PrimaryRanking;
    tiebreakOrder?: CompetitionTiebreak[];
  };

  processingGranularity: ProcessingGranularity;
};

// Competition State — mutable, stored as extension on draw definition
export type CompetitionParticipantState = {
  participantId: string;

  baselineRating: number;
  dynamicFormRating: number;
  pressureRating: number;

  roundsPlayed: number;
  wins: number;
  losses: number;
  draws: number;

  totalPointsWon: number;
  totalPointsLost: number;

  ratingHistory: CompetitionRatingHistoryEntry[];
};

export type CompetitionRatingHistoryEntry = {
  roundNumber: number;
  opponentParticipantId: string;
  dynamicFormRatingBefore: number;
  dynamicFormRatingAfter: number;
  pressureDelta: number;
  actualOutput: number;
  expectedOutput: number;
};

export type CompetitionRoundState = {
  roundNumber: number;
  laneAssignments?: Array<{
    laneNumber: number;
    participantIds: string[];
  }>;
  processed: boolean;
};

export type CompetitionLeaderboardRow = {
  participantId: string;
  rank: number;
  baselineRating: number;
  dynamicFormRating: number;
  pressureRating: number;
  wins: number;
  losses: number;
  draws: number;
  pointsWon: number;
  pointsLost: number;
};

export type CompetitionState = {
  participantStates: Record<string, CompetitionParticipantState>;
  roundStates: Record<number, CompetitionRoundState>;
  leaderboard?: CompetitionLeaderboardRow[];
};
