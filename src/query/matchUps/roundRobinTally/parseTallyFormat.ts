import { parse, ParsedFormat } from '@Helpers/matchUpFormatCode/parse';

/**
 * `parse(matchUpFormat)` for the tally, which only READS the result: countSets, countGames, countPoints and
 * isCombinedPointFormat each parsed the same code for every matchUp, and on the public drawData shape
 * (refreshResults) that re-parsing was about half of the whole request (FMLC128: ~430 ms).
 *
 * A parse is a pure function of its string, so this cache holds nothing derived from a record and cannot go
 * stale. Entries are frozen so that a reader which tried to write would throw rather than poison every later
 * tally; the cache is cleared when it reaches its bound, since a process sees a handful of codes.
 */
const MAX_ENTRIES = 256;
const parsedFormats = new Map<string, ParsedFormat | undefined>();

export function parseTallyFormat(matchUpFormat: string): Readonly<ParsedFormat> | undefined {
  // anything but a string is handed through untouched, exactly as the callers used to
  if (typeof matchUpFormat !== 'string') return parse(matchUpFormat);
  if (parsedFormats.has(matchUpFormat)) return parsedFormats.get(matchUpFormat);

  if (parsedFormats.size >= MAX_ENTRIES) parsedFormats.clear();
  const parsed = parse(matchUpFormat);
  parsedFormats.set(matchUpFormat, parsed && deepFreeze(parsed));
  return parsedFormats.get(matchUpFormat);
}

function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(deepFreeze);
    Object.freeze(value);
  }
  return value;
}
