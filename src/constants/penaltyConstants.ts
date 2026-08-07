export const COACHING = 'Coaching';
export const BALL_ABUSE = 'Ball Abuse';
export const RACKET_ABUSE = 'Racket Abuse';
export const VERBAL_ABUSE = 'Verbal Abuse';
export const INELIGIBILITY = 'INELIGIBILITY';
export const PHYSICAL_ABUSE = 'Physical Abuse';
export const UNSPORTSMANLIKE_CONDUCT = 'Unsportmanlike Conduct';
export const DRESS_CODE_VIOLATION = 'Dress Code Violation';
export const EQUIMENT_VIOLATION = 'Equipment Violation';
export const LEAVING_THE_COURT = 'Leaving the court';
export const FAILURE_TO_COMPLETE = 'Failure to complete';
export const NO_SHOW = 'No Show';
export const OTHER = 'Other';
export const REFUSAL_TO_PLAY = 'REFUSAL_TO_PLAY';
export const PROHIBITED_SUBSTANCE = 'PROHIBITED_SUBSTANCE';
export const PUNCTUALITY = 'Puncuality';
export const FAILUIRE_TO_SIGN_IN = 'Failure to sign in';

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
  EQUIMENT_VIOLATION,
  LEAVING_THE_COURT,
  REFUSAL_TO_PLAY,
  FAILURE_TO_COMPLETE,

  NO_SHOW,
  OTHER,
  PUNCTUALITY,
  FAILUIRE_TO_SIGN_IN,
} as const;

export default penaltyConstants;
