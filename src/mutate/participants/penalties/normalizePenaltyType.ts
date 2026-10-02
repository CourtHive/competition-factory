/**
 * Two penalty types were published misspelled: `EQUIMENT_VIOLATION` and `FAILUIRE_TO_SIGN_IN`. Saved
 * records and existing callers may hold them, so they are still ACCEPTED, and rewritten to the correct
 * spelling on every write; the misspelled values are removed at the next major. Anything else passes
 * through untouched (a caller may use its own vocabulary, including the display labels of
 * `penaltyConstants`).
 */
const MISSPELLED: Record<string, string> = {
  EQUIMENT_VIOLATION: 'EQUIPMENT_VIOLATION',
  FAILUIRE_TO_SIGN_IN: 'FAILURE_TO_SIGN_IN',
};

export function normalizePenaltyType<T>(penaltyType: T): T {
  return (typeof penaltyType === 'string' && MISSPELLED[penaltyType] ? MISSPELLED[penaltyType] : penaltyType) as T;
}
