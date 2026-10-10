import type { MatchUpStatusUnion } from './tournamentTypes';

/** Non-completed results remain unresolved unless an explicit historical rule settles them. */
export type RotatingPartnerStatusTreatment =
  | { kind: 'UNRESOLVED' }
  | { kind: 'EXCLUDE' }
  | { kind: 'PLAYED_POINTS' }
  | { kind: 'CREDIT'; winningPoints: number; losingPoints: number };

export type RotatingPartnerTallyPolicy = {
  version: 1;
  decidingPoints: 'INCLUDE' | 'EXCLUDE';
  overtimePoints: 'INCLUDE' | 'EXCLUDE';
  statusTreatments: Partial<Record<MatchUpStatusUnion, RotatingPartnerStatusTreatment>>;
};

export type RotatingPartnerContribution = {
  participantId: string;
  partnerId: string;
  opponentIds: string[];
  matchUpId: string;
  roundNumber: number;
  matchUpStatus: MatchUpStatusUnion;
  treatment: 'COMPLETED' | 'PLAYED_POINTS' | 'CREDIT';
  played: boolean;
  playedPoints: number;
  extraPoints: number;
  creditedPoints: number;
  pointsScored: number;
  pointsConceded: number;
  outcome?: 'WON' | 'LOST' | 'TIED';
};

export type RotatingPartnerStanding = {
  participantId: string;
  rank: number;
  pointsScored: number;
  pointsConceded: number;
  matchesPlayed: number;
  matchesWon: number;
  matchesLost: number;
  matchesTied: number;
};
