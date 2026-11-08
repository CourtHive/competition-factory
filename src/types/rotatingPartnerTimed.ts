import type {
  RotatingPartnerScoringPolicy,
  RotatingPartnerScoringVariant,
  RotatingPartnerScoreContract,
} from './rotatingPartnerScoring';

/** Internal groundwork; not yet admitted by competitionProfile or exported by an engine. */
export type TimedRotatingPartnerVariant = { tieResolution: 'ALLOW' | 'DECIDING_POINT' };

export type TimedRotatingPartnerPolicy = {
  defaultVariant: TimedRotatingPartnerVariant;
  permittedVariants: TimedRotatingPartnerVariant[];
  /** Once timed play is explicitly enabled, omission permits any positive safe-integer duration. */
  permittedMinutes?: number[];
};

/** The combined-point rules remain required; absence of timed disables timed selection. */
export type RotatingPartnerScoringPolicyWithTimed = RotatingPartnerScoringPolicy & {
  timed?: TimedRotatingPartnerPolicy;
};

export type RotatingPartnerScoringConfiguration =
  | {
      kind?: 'COMBINED_POINTS';
      combinedPointTotal: number;
      selectedVariant?: RotatingPartnerScoringVariant;
    }
  | { kind: 'TIMED'; minutes: number; selectedVariant?: TimedRotatingPartnerVariant };

export type TimedRotatingPartnerScoreContract = TimedRotatingPartnerVariant & { kind: 'TIMED'; minutes: number };

/** Canonical combined-point contracts retain their historical shape, without adding a kind key. */
export type RotatingPartnerScoreContractWithTimed = RotatingPartnerScoreContract | TimedRotatingPartnerScoreContract;
