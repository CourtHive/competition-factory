/**
 * The matchUpFormat a matchUp's score is played to, for the write path to validate against.
 *
 * ── A TEAM line's format was never consulted ──
 *
 * A line of a TEAM dual takes its format from its COLLECTION definition, in the tieFormat. Hydration
 * resolves that (`addMatchUpContext`), but the write path resolved only the matchUp's own format, then its
 * structure's, draw's and event's. A line carries none of its own, so every line score was validated
 * against no format at all — which answered "valid" to everything: bounds, completeness, set count. Found
 * 2026-10-02 by ruling X1, which refuses a score with no format and so refused every line write.
 *
 * The hydrated matchUp is asked between the matchUp's own format and the structure's: it carries the
 * collection's format for a line, and for anything else the same structure → draw → event fallback.
 */
type ResolveScoringFormatArgs = {
  inContextMatchUp?: { matchUpFormat?: string };
  matchUp?: { matchUpFormat?: string };
  structure?: { matchUpFormat?: string };
  drawDefinition?: { matchUpFormat?: string };
  event?: { matchUpFormat?: string };
  incoming?: string;
};

export function resolveScoringFormat({
  inContextMatchUp,
  drawDefinition,
  structure,
  incoming,
  matchUp,
  event,
}: ResolveScoringFormatArgs): string | undefined {
  return (
    incoming ??
    matchUp?.matchUpFormat ??
    inContextMatchUp?.matchUpFormat ??
    structure?.matchUpFormat ??
    drawDefinition?.matchUpFormat ??
    event?.matchUpFormat
  );
}
