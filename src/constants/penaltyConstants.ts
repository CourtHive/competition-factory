/**
 * DISPLAY LABELS, not codes: callers pass them straight through as `penaltyType`, so a label is what gets stored.
 * 8.0.0 stores the codes of `PenaltyTypeEnum` instead, and the factory (no runtime dependencies) keeps no display
 * strings: a consumer renders a code through `@courthive/i18n` (the `courthive-i18n` repo). Its existing
 * `penalties.*` keys are a different vocabulary and are reconciled with `PenaltyTypeEnum` then.
 */
export const COACHING = 'Coaching';
export const BALL_ABUSE = 'Ball Abuse';
export const RACKET_ABUSE = 'Racket Abuse';
export const VERBAL_ABUSE = 'Verbal Abuse';
export const INELIGIBILITY = 'INELIGIBILITY';
export const PHYSICAL_ABUSE = 'Physical Abuse';
/**
 * Corrected 2026-10-05 (was `'Unsportmanlike Conduct'`). Stored records may hold the old spelling; it is accepted
 * and rewritten on write (`normalizePenaltyType`) until 8.0.0, when it stops being accepted.
 */
export const UNSPORTSMANLIKE_CONDUCT = 'Unsportsmanlike Conduct';
export const DRESS_CODE_VIOLATION = 'Dress Code Violation';
export const EQUIPMENT_VIOLATION = 'Equipment Violation';
/** @deprecated misspelled; use `EQUIPMENT_VIOLATION`. Removed in 8.0.0. */
export const EQUIMENT_VIOLATION = EQUIPMENT_VIOLATION;
export const LEAVING_THE_COURT = 'Leaving the court';
export const FAILURE_TO_COMPLETE = 'Failure to complete';
export const NO_SHOW = 'No Show';
export const OTHER = 'Other';
export const REFUSAL_TO_PLAY = 'REFUSAL_TO_PLAY';
export const PROHIBITED_SUBSTANCE = 'PROHIBITED_SUBSTANCE';
/**
 * Corrected 2026-10-05 (was `'Puncuality'`). Stored records may hold the old spelling; it is accepted and rewritten
 * on write (`normalizePenaltyType`) until 8.0.0, when it stops being accepted.
 */
export const PUNCTUALITY = 'Punctuality';
export const FAILURE_TO_SIGN_IN = 'Failure to sign in';
/** @deprecated misspelled; use `FAILURE_TO_SIGN_IN`. Removed in 8.0.0. */
export const FAILUIRE_TO_SIGN_IN = FAILURE_TO_SIGN_IN;

export const penaltyConstants = {
  COACHING,
  BALL_ABUSE,
  RACKET_ABUSE,
  VERBAL_ABUSE,
  PHYSICAL_ABUSE,
  INELIGIBILITY,

  UNSPORTSMANLIKE_CONDUCT,
  PROHIBITED_SUBSTANCE,
  DRESS_CODE_VIOLATION,
  EQUIPMENT_VIOLATION,
  EQUIMENT_VIOLATION,
  LEAVING_THE_COURT,
  REFUSAL_TO_PLAY,
  FAILURE_TO_COMPLETE,

  NO_SHOW,
  OTHER,
  PUNCTUALITY,
  FAILURE_TO_SIGN_IN,
  FAILUIRE_TO_SIGN_IN,
} as const;

export default penaltyConstants;
