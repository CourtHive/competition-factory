/** Combined-point rules. Public round/query contracts also admit the timed branch through RotatingPartnerScoreContractWithTimed. */
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

export type TimedRotatingPartnerVariant = { tieResolution: 'ALLOW' | 'DECIDING_POINT' };

export type TimedRotatingPartnerPolicy = {
  defaultVariant: TimedRotatingPartnerVariant;
  permittedVariants: TimedRotatingPartnerVariant[];
  /** Timed play requires explicit opt-in; once enabled, omission permits any positive safe-integer minutes. */
  permittedMinutes?: number[];
};

export type RotatingPartnerScoringPolicyWithTimed = RotatingPartnerScoringPolicy & {
  timed?: TimedRotatingPartnerPolicy;
};

export type RotatingPartnerScoringConfiguration =
  | { kind?: 'COMBINED_POINTS'; combinedPointTotal: number; selectedVariant?: RotatingPartnerScoringVariant }
  | { kind: 'TIMED'; minutes: number; selectedVariant?: TimedRotatingPartnerVariant };

export type TimedRotatingPartnerScoreContract = TimedRotatingPartnerVariant & { kind: 'TIMED'; minutes: number };

/** Historical combined-point contracts keep their original representation, without a kind key. */
export type RotatingPartnerScoreContractWithTimed =
  (RotatingPartnerScoreContract & { kind?: 'COMBINED_POINTS' }) | TimedRotatingPartnerScoreContract;

export type RotatingPartnerScoringPolicies = Partial<
  Record<'AMERICANO' | 'MEXICANO', RotatingPartnerScoringPolicyWithTimed>
>;
