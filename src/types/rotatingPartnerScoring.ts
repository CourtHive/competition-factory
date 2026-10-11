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

export type RotatingPartnerScoringVariant = {
  tieResolution: RotatingPartnerScoreContract['tieResolution'];
  winningMargin?: number;
};

/** A singleton permitted list locks organizer choice; no UI-only enforcement. */
export type RotatingPartnerScoringPolicy = {
  defaultVariant: RotatingPartnerScoringVariant;
  permittedVariants: RotatingPartnerScoringVariant[];
  /** Omit to allow any positive safe-integer total. */
  permittedPointTotals?: number[];
};

export type RotatingPartnerScoringPolicies = Partial<Record<'AMERICANO' | 'MEXICANO', RotatingPartnerScoringPolicy>>;
