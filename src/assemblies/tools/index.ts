export { nearestPowerOf2, nextPowerOf2, isPowerOf2, isOdd, isConvertableInteger, isNumeric } from '@Tools/math';
export { visualizeScheduledMatchUps } from '../../tests/testHarness/testUtilities/visualizeScheduledMatchUps';
// Pure helpers for the signed competitive-exposure axis. Exported here rather
// than from a governor because they take POSITIONAL arguments — a governor
// export becomes an engine method, and the engine wrapper hands every method a
// single params object, which would silently arrive as `signedDelta`.
//
// `resolveDeltaBand` validates on every call, which is right for one-off use.
// A corpus walk pairs `resolveDeltaBoundaries` (validate + convert ONCE) with
// `bandFromBoundaries` (walk per row); exporting only the former would leave
// the boundaries it returns as inert data.
export {
  resolveDeltaBoundaries,
  bandFromBoundaries,
  signedRatingDelta,
  resolveDeltaBand,
} from '@Query/matchUp/resolveDeltaBand';
export { hasAttributeValues, createMap, generateHashCode, undefinedToNull } from '@Tools/objects';
export { generateDateRange, dateTime, isValidEmbargoDate } from '@Tools/dateTime';
export { matchUpChronologicalSort } from '@Functions/sorters/matchUpChronologicalSort';
export { matchUpScheduleSort } from '@Functions/sorters/matchUpScheduleSorter';
export { structureSort } from '../../functions/sorters/structureSort';
export { matchUpSort } from '../../functions/sorters/matchUpSort';
// Repair an unlinked drawDefinition so it can be READ. Exported here rather than as a governor
// method because callers are ingest/import tools operating on a record they hold, not on engine
// state — and because third-party data cannot be relied on to arrive linked.
export { inferDrawLinks } from '@Mutate/drawDefinitions/links/inferDrawLinks';
export { dehydrateMatchUps } from '@Mutate/tournaments/dehydrate';
export { extractAttributes } from '@Tools/extractAttributes';
export { definedAttributes } from '@Tools/definedAttributes';
export { attributeFilter } from '@Tools/attributeFilter';
export { JSON2CSV, flattenJSON } from '@Tools/json';
export { generateTimeCode } from '@Tools/timeCode';
export { makeDeepCopy } from '@Tools/makeDeepCopy';
export { constantToString } from '@Tools/strings';
export { numericSort } from '@Tools/sorting';
export { UUID, UUIDS } from '@Tools/UUID';
export { timeZone } from '@Tools/timeZone';

export {
  allNumeric,
  chunkArray,
  chunkByNth,
  chunkSizeProfile,
  countValues,
  generateRange,
  groupValues,
  instanceCount,
  intersection,
  noNulls,
  noNumeric,
  overlap,
  occurrences,
  randomMember,
  randomPop,
  shuffleArray,
  subSort,
  unique,
} from '@Tools/arrays';
