/**
 * Legacy penalty types, rewritten to their `PenaltyTypeEnum` code. The factory stores penalty CODES (CA,
 * 2026-10-15); saved records and existing callers may hold an older value, so each is still ACCEPTED and rewritten
 * to its code on every write (`addPenalty`, `modifyPenalty`) and by `migrateTournamentRecord`. 8.0.0 stops
 * accepting them. Anything else passes through untouched: a caller may use a vocabulary of its own.
 *
 * - two misspelled `PenaltyTypeEnum` codes, 2026-10-02 (#5117): `EQUIMENT_VIOLATION`, `FAILUIRE_TO_SIGN_IN`
 * - every display label `penaltyConstants` carried before its values became codes, including the two misspelled
 *   labels corrected 2026-10-05 (Q4): `'Unsportmanlike Conduct'`, `'Puncuality'`
 */
export const LEGACY_PENALTY_TYPES: Readonly<Record<string, string>> = {
  EQUIMENT_VIOLATION: 'EQUIPMENT_VIOLATION',
  FAILUIRE_TO_SIGN_IN: 'FAILURE_TO_SIGN_IN',

  Coaching: 'COACHING',
  'Ball Abuse': 'BALL_ABUSE',
  'Racket Abuse': 'RACKET_ABUSE',
  'Verbal Abuse': 'VERBAL_ABUSE',
  'Physical Abuse': 'PHYSICAL_ABUSE',
  'Audible Obscenity': 'AUDIBLE_OBSCENITY',
  'Visible Obscenity': 'VISIBLE_OBSCENITY',
  'Time Violation': 'TIME_VIOLATION',
  'Unsportsmanlike Conduct': 'UNSPORTSMANLIKE_CONDUCT',
  'Unsportmanlike Conduct': 'UNSPORTSMANLIKE_CONDUCT',
  'Dress Code Violation': 'DRESS_CODE_VIOLATION',
  'Equipment Violation': 'EQUIPMENT_VIOLATION',
  'Leaving the court': 'LEAVING_THE_COURT',
  'Failure to complete': 'FAILURE_TO_COMPLETE',
  'No Show': 'NO_SHOW',
  Other: 'OTHER',
  Punctuality: 'PUNCTUALITY',
  Puncuality: 'PUNCTUALITY',
  'Failure to sign in': 'FAILURE_TO_SIGN_IN',
  'Failure to sign out': 'FAILURE_TO_SIGN_OUT',
};

export function normalizePenaltyType<T>(penaltyType: T): T {
  return (
    typeof penaltyType === 'string' && Object.hasOwn(LEGACY_PENALTY_TYPES, penaltyType)
      ? LEGACY_PENALTY_TYPES[penaltyType]
      : penaltyType
  ) as T;
}
