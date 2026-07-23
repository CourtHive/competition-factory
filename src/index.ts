export { factoryVersion as version } from './functions/global/factoryVersion';

// GOVERNORS ------------------------------------------------------------
export * as governors from './assemblies/governors';
export * from './assemblies/governors';

// UTILITIES ------------------------------------------------------------
export * as matchUpFormatCode from './assemblies/governors/matchUpFormatGovernor';
export * as utilities from './assemblies/tools'; // deprecate
export * as tools from './assemblies/tools';

// GLOBAL STATE ---------------------------------------------------------
export * as globalState from './global/state/globalState';
export { policyRegistry } from './global/policyRegistry';
export { policyComposer } from './global/policyComposer';
export type { PolicyComposer } from './global/policyComposer';

// ERRORS - rich, typed error hierarchy ---------------------------------
// Class-based errors carrying code + cause + suggestions + path + context.
// Backwards-compatible with the legacy `{ error: { code, message } }`
// envelope via `FactoryError.toJSON()`; pairs with the upcoming `unwrap()`
// helper which throws subclasses by `error.code`.
export * as errors from './errors';
export {
  FactoryError,
  EventNotFoundError,
  InvalidDateError,
  InvalidValuesError,
  MatchUpNotFoundError,
  MissingDrawDefinitionError,
  MissingEventError,
  MissingOfficialRecordError,
  MissingSanctioningRecordError,
  MissingTournamentRecordError,
  MissingTournamentRecordsError,
  MissingValueError,
  ParticipantNotFoundError,
  StructureNotFoundError,
  constructFactoryError,
  registerSuggestions,
} from './errors';
export type { FactoryErrorOptions } from './errors';

export { forge, unwrap, unwrapOr, generatePatch, dryRun, explain } from './forge';
export type { Unwrap, JsonPatch, JsonPatchOp, DryRunResult, EmittedNotice, ExplainResult } from './forge';
export type {
  BuildFacade,
  BuildResult,
  DrawOpts,
  EngineInspection,
  EngineInspectionCounts,
  EntriesOpts,
  EventBus,
  EventHandler,
  EventPredicate,
  EventSeed,
  GenderInput,
  ParticipantBuildResult,
  PersonInput,
  QueryFacade,
  Topic,
  TopicPayloadMap,
  Unsubscribe,
} from './forge';

// ENGINES - For cusomization --------------------------------------------
export { asyncEngine } from './assemblies/engines/async';
export { syncEngine } from './assemblies/engines/sync';
export { askEngine } from './assemblies/engines/ask';

export { matchUpEngine } from './assemblies/engines/matchUp';
export { mocksEngine } from './assemblies/engines/mock';

// ENGINES - Standalone class engines -----------------------------------
export { AvailabilityEngine } from './assemblies/engines/availability';
export * as availability from './assemblies/engines/availability';

// ENGINES - Scale engine -----------------------------------------------
export { scaleEngine } from './assemblies/engines/scale';

// ENGINES - Sanctioning engine -----------------------------------------
export { sanctioningEngine } from './assemblies/engines/sanctioning';

// ENGINES - Officiating engine -----------------------------------------
export { officiatingEngine } from './assemblies/engines/officiating';

// ENGINES - For backwards compatibility ---------------------------------
// Typed defaults — see `tests/engines/syncEngine/index.ts` for the rationale
// and for the `Untyped` opt-out variants for consumers still on the pre-5.x
// open shape (e.g. third-party packages without TypeScript or with implicit-any
// reliance — same runtime singleton, looser type).
export { competitionEngine, tournamentEngine } from './tests/engines/syncEngine';
export { competitionEngineUntyped, tournamentEngineUntyped } from './tests/engines/syncEngine';
// Async variants — same governor surface as competitionEngine /
// tournamentEngine, but built atop `asyncEngine()` so each consumer
// gets per-request state isolation via Node's async_hooks. Use these
// where a sync singleton would risk cross-request contamination —
// e.g. CFS executionQueue helpers that need findMatchUp on a record
// fetched under a per-tournament lock. The bare `asyncEngine()`
// factory remains exported for callers that want to assemble a
// custom governor set themselves.
export { competitionEngineAsync, tournamentEngineAsync } from './tests/engines/asyncEngine';

// FIXTURES --------------------------------------------------------------
export { fixtures } from './fixtures';

// PURE STATS — usable without an engine instance.
export { computeRatingDistributionStats } from './query/formatWizard/distributionStats';

// READ MODEL — the TODS→SQL-rows builder toolkit (single source for cast() +
// the CFS incremental producer). See query/readModel/index.ts.
export * as readModel from './query/readModel';

// PURE — availability → personRequests translation (usable without an engine instance).
// Maps a person's declared per-day availability to whole-day DO_NOT_SCHEDULE
// personRequests for a tournament's scheduled dates. See declarations tier.
export { translateAvailabilityToPersonRequests } from './mutate/matchUps/schedule/scheduleMatchUps/personRequests/translateAvailabilityToPersonRequests';

// CONSTANTS -------------------------------------------------------------
export * as factoryConstants from './constants';
export * from './constants';

// TYPES -----------------------------------------------------------------
export type * from './types';

// Statistics types (top-level convenience re-exports)
export type { StatObject, MatchStatistics, StatCounters, StatisticsOptions } from './query/scoring/statistics/types';
export { toStatObjects } from './query/scoring/statistics/toStatObjects';
export { calculateMatchStatistics } from './query/scoring/statistics/standalone';
