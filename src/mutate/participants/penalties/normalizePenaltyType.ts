/**
 * Penalty types published misspelled. Saved records and existing callers may hold them, so they are still
 * ACCEPTED, and rewritten to the correct spelling on every write; 8.0.0 stops accepting them. Anything else
 * passes through untouched (a caller may use its own vocabulary, including the display labels of
 * `penaltyConstants`).
 *
 * - two `PenaltyTypeEnum` codes, 2026-10-02 (#5117): `EQUIMENT_VIOLATION`, `FAILUIRE_TO_SIGN_IN`
 * - two `penaltyConstants` display labels, 2026-10-05 (Q4): `'Unsportmanlike Conduct'`, `'Puncuality'`
 */
const MISSPELLED: Record<string, string> = {
  EQUIMENT_VIOLATION: 'EQUIPMENT_VIOLATION',
  FAILUIRE_TO_SIGN_IN: 'FAILURE_TO_SIGN_IN',
  'Unsportmanlike Conduct': 'Unsportsmanlike Conduct',
  Puncuality: 'Punctuality',
};

export function normalizePenaltyType<T>(penaltyType: T): T {
  return (typeof penaltyType === 'string' && MISSPELLED[penaltyType] ? MISSPELLED[penaltyType] : penaltyType) as T;
}
