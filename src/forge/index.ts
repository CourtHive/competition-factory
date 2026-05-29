/**
 * Forge namespace — staging area for new factory functionality before it
 * graduates to a governor or query module. See `forge.md` for the original
 * 2.x vision.
 *
 * Currently hosts the developer-JOY prototype facades:
 *  - `engine.q.*` — the unwrap query facade (see `q.ts`, #2 silent-fallback)
 *  - `unwrap(result)` — the throwing variant that pairs with #7's typed
 *    error hierarchy (see `unwrap.ts`)
 *  - `engine.inspect()` — the live state snapshot (see `inspect.ts`, #8)
 *  - `engine.on/once/off/waitFor` — the typed event bus (see `bus.ts`, #5)
 *  - `engine.build.*` — fluent builders (see `builders/`, #6)
 *
 * All are wired onto the engine in `assemblies/engines/parts/engineStart.ts`.
 */

export { buildQueryFacade, queryRegistry } from './q';
export type { QueryFacade } from './q';
export { unwrap } from './unwrap';
export type { Unwrap } from './unwrap';
export { inspect } from './inspect';
export type { EngineInspection, EngineInspectionCounts } from './inspect';
export { createEventBus } from './bus';
export type { EventBus, EventHandler, EventPredicate, Unsubscribe } from './bus';
export type { Topic, TopicPayloadMap } from './topicTypes';
export { buildFacade, EventBuilder, ParticipantBuilder } from './builders';
export type {
  BuildFacade,
  BuildResult,
  DrawOpts,
  EntriesOpts,
  EventSeed,
  GenderInput,
  ParticipantBuildResult,
  PersonInput,
} from './builders';

// Legacy placeholder export retained for prior consumers.
export const forge = {};
export default forge;
