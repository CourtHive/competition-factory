/**
 * Whether a matchUp holds a reason: for the match (`matchUpStatusCode`) or for a side (`sideStatusCodes`). A planner
 * that certifies a matchUp as holding nothing it would have to keep or rewrite asks this, as it asks for a score or
 * provenance.
 */
export function holdsReasons(matchUp?: { matchUpStatusCode?: string; sideStatusCodes?: Record<number, string> }) {
  if (!matchUp) return false;
  if (matchUp.matchUpStatusCode) return true;
  const sideStatusCodes = matchUp.sideStatusCodes;
  return !!sideStatusCodes && (!!sideStatusCodes[1] || !!sideStatusCodes[2]);
}
