import { parse } from '@Helpers/matchUpFormatCode/parse';
import { isString } from '@Tools/objects';

/**
 * Whether a matchUpFormat code is well-formed. `parse` refuses exactly what this refuses (CA, 2026-10-02),
 * so this is that question asked of `parse` — see its comment for what well-formed means.
 *
 * This compared the code with a parse-then-stringify round trip, keeping a redundant `@N` only where a
 * regex found one — and the regex knew only one-digit `@` and no `NOAD`, so `SET3-S:6NOAD/TB7@6`,
 * `SET3-S:12/TB7@12` and three-digit tiebreaks were refused though well-formed (validator debate G3).
 */
export function isValidMatchUpFormat({ matchUpFormat }: { matchUpFormat: string }): boolean {
  if (!isString(matchUpFormat) || matchUpFormat === '') return false;
  return !!parse(matchUpFormat);
}
