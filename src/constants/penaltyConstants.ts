/**
 * Penalty CODES: each value is its `PenaltyTypeEnum` code, the vocabulary of the `Penalty.penaltyType` type, the
 * CODES schema and the `@courthive/i18n` `penalties.<CODE>` keys (CA, 2026-10-15). The factory keeps no display
 * strings; a consumer renders a code through `@courthive/i18n` (the `courthive-i18n` repo).
 *
 * They were display labels (`'Ball Abuse'`) until this 7.x release, and a label is what got stored. A legacy label
 * is accepted and rewritten to its code on write (`normalizePenaltyType`) and by `migrateTournamentRecord`, until
 * 8.0.0.
 */
export const COACHING = 'COACHING';
export const BALL_ABUSE = 'BALL_ABUSE';
export const RACKET_ABUSE = 'RACKET_ABUSE';
export const VERBAL_ABUSE = 'VERBAL_ABUSE';
export const INELIGIBILITY = 'INELIGIBILITY';
export const PHYSICAL_ABUSE = 'PHYSICAL_ABUSE';
export const AUDIBLE_OBSCENITY = 'AUDIBLE_OBSCENITY';
export const VISIBLE_OBSCENITY = 'VISIBLE_OBSCENITY';
export const TIME_VIOLATION = 'TIME_VIOLATION';
export const UNSPORTSMANLIKE_CONDUCT = 'UNSPORTSMANLIKE_CONDUCT';
export const DRESS_CODE_VIOLATION = 'DRESS_CODE_VIOLATION';
export const EQUIPMENT_VIOLATION = 'EQUIPMENT_VIOLATION';
/** @deprecated misspelled; use `EQUIPMENT_VIOLATION`. Removed in 8.0.0. */
export const EQUIMENT_VIOLATION = EQUIPMENT_VIOLATION;
export const LEAVING_THE_COURT = 'LEAVING_THE_COURT';
export const FAILURE_TO_COMPLETE = 'FAILURE_TO_COMPLETE';
export const NO_SHOW = 'NO_SHOW';
export const OTHER = 'OTHER';
export const REFUSAL_TO_PLAY = 'REFUSAL_TO_PLAY';
export const PROHIBITED_SUBSTANCE = 'PROHIBITED_SUBSTANCE';
export const PUNCTUALITY = 'PUNCTUALITY';
export const FAILURE_TO_SIGN_IN = 'FAILURE_TO_SIGN_IN';
export const FAILURE_TO_SIGN_OUT = 'FAILURE_TO_SIGN_OUT';
/** @deprecated misspelled; use `FAILURE_TO_SIGN_IN`. Removed in 8.0.0. */
export const FAILUIRE_TO_SIGN_IN = FAILURE_TO_SIGN_IN;

export const penaltyConstants = {
  COACHING,
  BALL_ABUSE,
  RACKET_ABUSE,
  VERBAL_ABUSE,
  PHYSICAL_ABUSE,
  INELIGIBILITY,
  AUDIBLE_OBSCENITY,
  VISIBLE_OBSCENITY,

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
  TIME_VIOLATION,
  FAILURE_TO_SIGN_IN,
  FAILURE_TO_SIGN_OUT,
  FAILUIRE_TO_SIGN_IN,
} as const;

export default penaltyConstants;
