/**
 * The positional `matchUpStatusCodes` array, as records written before 8.0.0 hold it.
 *
 * Nothing writes it and no decision reads it: a reason lives in `sideStatusCodes` (keyed by side) or
 * `matchUpStatusCode` (the match), and an exit's origin in `sideExitProvenance`. A record that still holds the array
 * stays queryable as it is, and is not refused a write for holding it. A write removes it from every matchUp it
 * touches, at the matchUp's `updatedAt` stamp, so a matchUp never carries a display code that contradicts the result
 * written over it.
 */
export function dropLegacyStatusCodes(matchUp?: { matchUpStatusCodes?: unknown } | null): void {
  if (matchUp?.matchUpStatusCodes !== undefined) delete matchUp.matchUpStatusCodes;
}
