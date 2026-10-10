/** Resolved match rules; governing policy and organizer selection are resolved before scoring. */
export type RotatingPartnerScoreContract = {
  combinedPointTotal: number;
  tieResolution: 'ALLOW' | 'DECIDING_POINT' | 'WIN_BY_MARGIN';
  winningMargin?: number;
};

export type RotatingPartnerScoreAnalysis = {
  valid: boolean;
  complete: boolean;
  tied?: boolean;
  winningSide?: 1 | 2;
};
