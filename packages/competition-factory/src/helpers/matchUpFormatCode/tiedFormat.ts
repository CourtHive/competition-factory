import { parse, type ParsedFormat } from '@Helpers/matchUpFormatCode/parse';

/** A timed segment with no tiebreak at time closes level when time is called level (spec § 6.4 rule 3). */
function segmentCanCloseLevel(setFormat?: { timed?: boolean; tiebreakFormat?: unknown }): boolean {
  return !!setFormat?.timed && !setFormat.tiebreakFormat;
}

/**
 * Whether a match played in `matchUpFormat` can end level, `COMPLETED` with no `winningSide` (scoring-engine spec
 * § 9.7). A structure that advances a winner accepts such a format: its level result names the winner and records how
 * it was decided (standings phase 2 § 1.1, CA 2026-11-04), and one with no decider is refused at entry.
 *
 * - a `P{n}` combined total with an even n and no tie resolution (§ 7);
 * - an aggregate whose total can tie with no declared decider: only an exactly-N aggregate declares
 *   one, its `-F:` (set N + 1, § 9.4), and a timed decider with no tiebreak at time decides nothing;
 * - an exactly-N or best-of-N count that can be level once every set is played: an even N, or any
 *   set that can close level (a timed segment with no `/TB`, in the ordinary or the final format).
 *   With an odd N, one level set and an even split of the rest is a level count (§ 9.1, § 9.2).
 */
export function formatCanEndTied(matchUpFormat?: string): boolean {
  return parsedFormatCanEndTied(parse(matchUpFormat ?? ''));
}

/** `formatCanEndTied` on a parsed format. */
export function parsedFormatCanEndTied(parsed?: ParsedFormat): boolean {
  const format = parsed?.setFormat;
  if (!parsed || !format) return false;
  if (format.combinedPointTotal) return format.combinedPointTotal % 2 === 0 && format.tieResolution === 'ALLOW';

  // unlimited overtime plays periods until one ends unequal: it cannot finish level (a match clock, which could
  // end it level, is refused with overtime until the clock-expiry slice, Ruling 1)
  if (parsed.overtimeFormat?.count === 'unlimited') return false;

  if (parsed.aggregate)
    return !(parsed.exactly && parsed.finalSetFormat) || segmentCanCloseLevel(parsed.finalSetFormat);

  const setCount = parsed.exactly ?? parsed.bestOf ?? 1;
  if (setCount % 2 === 0) return true;
  const finalFormat = parsed.finalSetFormat ?? format;
  return segmentCanCloseLevel(finalFormat) || (setCount > 1 && segmentCanCloseLevel(format));
}
