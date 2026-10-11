import type { RotatingPartnerScoringVariant } from './rotatingPartnerScoring';

/** Versioned draw-level configuration. MatchUps, scores and standings state live separately. */
type RotatingPartnerProfile = {
  version: 1;
  entrantScope: 'INDIVIDUAL';
  matchUpType: 'DOUBLES';
  scoring: {
    combinedPointTotal: number;
    selectedVariant?: RotatingPartnerScoringVariant;
  };
  standings: { metric: 'SIDE_POINTS'; attribution: 'EACH_INDIVIDUAL' };
};

export type AmericanoCompetitionProfile = RotatingPartnerProfile & {
  format: 'AMERICANO';
  pairing: { seed: number; algorithmVersion: 1 };
  completion: { kind: 'PARTNERSHIP_COVERAGE' };
};

export type MexicanoCompetitionProfile = RotatingPartnerProfile & {
  format: 'MEXICANO';
  pairing: {
    seed: number;
    algorithmVersion: 1;
    groupBy: 'ADJACENT_STANDINGS';
    partners: 'FIRST_FOURTH_SECOND_THIRD';
  };
  completion: { kind: 'ROUND_COUNT'; rounds: number };
};

/** Ladder rules remain in the existing inherited LadderPolicy; this is format identity. */
export type LadderCompetitionProfile = { version: 1; format: 'LADDER' };

export type CompetitionProfile = AmericanoCompetitionProfile | MexicanoCompetitionProfile | LadderCompetitionProfile;
