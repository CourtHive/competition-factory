import type { ParsedFormat } from '@Helpers/matchUpFormatCode/parse';
import { parse } from '@Helpers/matchUpFormatCode/parse';
import { isString } from '@Tools/objects';

/**
 * Whether a matchUpFormat code is valid FOR NEW USE: well-formed (see `isWellFormedMatchUpFormat`),
 * and not one of the formats the scoring engine specification refuses for a new format (§ 16,
 * decision 19; CA 2026-10-18):
 *
 * - a standard set whose tiebreak comes below S − 1 (`@T` with T < S − 1, § 4.2): the set would close
 *   below S without its tiebreak;
 * - an aggregate of standard sets (§ 9.3 rule 5): aggregation is defined over timed and tiebreak-only
 *   segments, whose scores are units.
 *
 * ── valid for new use is not readable ──
 *
 * Both refused kinds are well-formed, and a record v1 wrote may already hold one. A stored format is
 * READ by `parse` (and `isWellFormedMatchUpFormat`), which still accepts it, so a persisted score
 * replays as v1 scored it (§ 12.8: refusals apply when an action is offered, never on replay). Ask
 * this at the boundary where a format is set; ask `isWellFormedMatchUpFormat` where a stored one is read.
 *
 * This compared the code with a parse-then-stringify round trip, keeping a redundant `@N` only where a
 * regex found one — and the regex knew only one-digit `@` and no `NOAD`, so `SET3-S:6NOAD/TB7@6`,
 * `SET3-S:12/TB7@12` and three-digit tiebreaks were refused though well-formed (validator debate G3).
 */
export function isValidMatchUpFormat({ matchUpFormat }: { matchUpFormat: string }): boolean {
  if (!isString(matchUpFormat) || matchUpFormat === '') return false;
  const parsed = parse(matchUpFormat);
  return !!parsed && !refusedForNewUse(parsed);
}

/**
 * Whether a matchUpFormat code is well-formed: what `parse` reads. `parse` refuses exactly what this
 * refuses (CA, 2026-10-02), so this is that question asked of `parse` — see its comment for what
 * well-formed means. Use it where a STORED format is read (scoring, timing, a stored tieFormat).
 */
export function isWellFormedMatchUpFormat({ matchUpFormat }: { matchUpFormat: string }): boolean {
  if (!isString(matchUpFormat) || matchUpFormat === '') return false;
  return !!parse(matchUpFormat);
}

/** The parts of a set format these refusals read. */
type SetSpec = { setTo?: number; tiebreakAt?: number | string; tiebreakFormat?: object } | undefined;

function refusedForNewUse(parsed: ParsedFormat): boolean {
  const setFormat: SetSpec = parsed.setFormat;
  const finalSetFormat: SetSpec = parsed.finalSetFormat;
  if ([setFormat, finalSetFormat].some(tiebreakBelowSetToLessOne)) return true;
  if (!parsed.aggregate) return false;
  // every segment of an aggregate is summed: the set format always, and the final-set format too unless
  // it is an exactly-N aggregate's decider, set N + 1, which is not one of the N (§ 9.4)
  return isStandardSet(setFormat) || (!parsed.exactly && isStandardSet(finalSetFormat));
}

function isStandardSet(setFormat: SetSpec): boolean {
  return typeof setFormat?.setTo === 'number';
}

function tiebreakBelowSetToLessOne(setFormat: SetSpec): boolean {
  const setTo = setFormat?.setTo;
  if (typeof setTo !== 'number' || !setFormat?.tiebreakFormat) return false;
  return Number(setFormat.tiebreakAt ?? setTo) < setTo - 1;
}
