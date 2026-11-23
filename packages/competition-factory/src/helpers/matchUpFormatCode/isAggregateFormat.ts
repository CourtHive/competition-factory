/**
 * Determines if a parsed matchUpFormat represents aggregate scoring.
 *
 * Aggregate scoring is signaled by:
 * parsed.aggregate === true  (match-level A modifier, e.g. SET7XA-S:T10P)
 */
export function isAggregateFormat(parsed: any): boolean {
  return !!parsed?.aggregate;
}
