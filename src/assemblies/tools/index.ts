export { nearestPowerOf2, nextPowerOf2, isPowerOf2, isOdd, isConvertableInteger, isNumeric } from '@Tools/math';
export { visualizeScheduledMatchUps } from '@Assemblies/tools/visualizeScheduledMatchUps';
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
// Calendar intents, named. `dateTime` conflates a calendar day, a wall clock and
// an instant in one flat namespace; these say which is meant. Same behaviour —
// `dateTime` re-exports from them — so callers can move one call site at a time.
export { plainDate } from '@Tools/plainDate';
export { plainTime } from '@Tools/plainTime';
export { matchUpChronologicalSort } from '@Functions/sorters/matchUpChronologicalSort';
export { matchUpScheduleSort } from '@Functions/sorters/matchUpScheduleSorter';
export { structureSort } from '@Functions/sorters/structureSort';
export { matchUpSort } from '@Functions/sorters/matchUpSort';
// Repair an unlinked drawDefinition so it can be READ. Exported here rather than as a governor
// method because callers are ingest/import tools operating on a record they hold, not on engine
// state — and because third-party data cannot be relied on to arrive linked.
export { inferDrawLinks } from '@Query/drawDefinition/inferDrawLinks';
// Where a matchUp's winner, loser and bye go: target matchUps and the drawPosition each takes there. The engine's own
// progression geometry, for an ingest tool that must place a participant a source left out (a loser who declined a
// consolation, recorded as a bye). A tool, not a governor method: it reads a drawDefinition and in-context matchUps the
// caller holds (`allDrawMatchUps({ inContext: true })`), and an engine method would resolve them from state instead.
export { positionTargets } from '@Query/matchUp/positionTargets';
// How a link TRAVERSES: by finishing position (out of a round robin, labelled POSITION or WINNER) or by round (out of
// an elimination structure). A client reading `drawDefinition.links` asks here instead of comparing `linkType`, so it
// reads a round robin's WINNER link as the engine does (CA, 2026-10-23). Positional arguments: (link, drawDefinition).
export { traversesByFinishingPosition, traversesByRound, isRoundWinnerLink } from '@Helpers/drawTopology/linkTraversal';
// Assemble a tournamentRecord from partial/third-party sources. Moved here from a TMX dev utility
// so there is ONE versioned, tested copy: it was consumed by seven call sites across four repos
// while living unversioned in a client app. `buildFromSources` repairs draw links on the way out.
export {
  buildFromSources,
  buildTournamentRecord,
  repairDrawLinks,
  classifySource,
  extractEventData,
  extractMatchUps,
  extractParticipants,
} from '@Generators/ingestion/buildFromSources/buildFromSources';
export { dehydrateMatchUps } from '@Mutate/tournaments/dehydrate';
// What part of a record an executionQueue reads and may write, for a storage layer that keeps a tournament in parts
// (a shell, its draws, its participants). Pure reads of the methods and their params, called BEFORE anything is
// loaded, so tools rather than engine methods, which resolve from state. `reduceRecordToFootprint` builds the partial
// record such a layer would assemble.
export { getMutationFootprint } from '@Query/footprint/getMutationFootprint';
export { reduceRecordToFootprint } from '@Query/footprint/reduceRecordToFootprint';
// The read the engine makes of every attribute promoted from an extension: first-class when present, else the legacy
// extension. Here rather than on a governor because a governor export becomes an engine method, and this reads an
// element the caller holds. The migration-5.0.0 guide has promised it since 5.0.0 under a subpath that never resolved.
export { firstClassOrExtension } from '@Helpers/extensions/firstClassOrExtension';
export { extractAttributes } from '@Tools/extractAttributes';
export { definedAttributes } from '@Tools/definedAttributes';
export { attributeFilter } from '@Tools/attributeFilter';
export { JSON2CSV, flattenJSON } from '@Tools/json';
export { generateTimeCode } from '@Tools/timeCode';
export { makeDeepCopy } from '@Tools/makeDeepCopy';
export { constantToString } from '@Tools/strings';
export { numericSort } from '@Tools/sorting';
export { UUID, UUIDS } from '@Tools/UUID';
export { createSeededRandom, randomSource, setRandomSource } from '@Tools/prng';
export { competitionNow, nowIso, now, setClock, setCompetitionClock } from '@Tools/clock';
export { canonicalizeJsonText, canonicalJson } from '@Tools/canonicalJson';
export { timeZone } from '@Tools/timeZone';
// The zoned intent, completing plainDate / plainTime / zonedDateTime. `timeZone`
// is a thin adapter over this module and holds no arithmetic of its own.
export { zonedDateTime } from '@Tools/zonedDateTime';

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

// Stateless positional functions by domain (CA 2026-11-07): their home, rather than a governor that mounts them on
// engines which call every method with one params object. Each module says what its domain holds.
export * as publishing from './publishing';
export * as matchUps from './matchUps';
export * as formats from './formats';
export * as scoring from './scoring';
export * as entries from './entries';
export * as draws from './draws';
