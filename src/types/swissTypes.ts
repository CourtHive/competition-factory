export type SwissPolicy = {
  totalRounds: number;
  tiebreakMethods?: string[];
  pairingMethod?: 'SCORE_GROUP' | 'RATING_BASED';
  allowDraws?: boolean;
  colorAlternation?: boolean;
  hardNoRepeat?: boolean;
  /** what the pairing-allocated bye scores (FIDE C.07 16.2.1): 1, 0.5 or 0; 1 when absent */
  byePoints?: number;
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

/**
 * How a round went unplayed (FIDE C.07 Art. 16): the pairing gave the round's bye, a walkover was won or lost, or the
 * entrant sat out a round in which another entrant also did, so which of them had the bye cannot be told.
 */
export type UnplayedRound = 'BYE' | 'FORFEIT_WIN' | 'FORFEIT_LOSS' | 'ABSENT';

/** one round of a participant's record: the points it scored, against whom, or how it went unplayed */
export type SwissRoundResult = {
  roundNumber: number;
  points: number;
  /** the opponent met over the board, or the one scheduled for a forfeit */
  opponentId?: string;
  unplayed?: UnplayedRound;
};

export type SwissParticipantRecord = {
  participantId: string;
  wins: number;
  losses: number;
  draws: number;
  points: number;
  opponentIds: string[];
  opponentOutcomes: Map<string, OpponentOutcome>;
  roundPoints: number[];
  rounds: SwissRoundResult[];
};
