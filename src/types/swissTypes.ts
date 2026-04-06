export type SwissPolicy = {
  totalRounds: number;
  tiebreakMethods?: string[];
  pairingMethod?: 'SCORE_GROUP' | 'RATING_BASED';
  allowDraws?: boolean;
  colorAlternation?: boolean;
  hardNoRepeat?: boolean;
};

export type ScoreGroup = {
  wins: number;
  losses: number;
  draws: number;
  participantIds: string[];
};

export type SwissStanding = {
  participantId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  buchholz?: number;
  medianBuchholz?: number;
  sonnebornBerger?: number;
  progressiveScore?: number;
  opponentIds: string[];
  rank: number;
};

export type SwissState = {
  roundsPlayed: number;
  totalRounds: number;
  scoreGroups: ScoreGroup[];
  standings: SwissStanding[];
};

export type OpponentOutcome = 'WIN' | 'LOSS' | 'DRAW';

export type SwissParticipantRecord = {
  participantId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  opponentIds: string[];
  opponentOutcomes: Map<string, OpponentOutcome>;
  roundPoints: number[];
};
