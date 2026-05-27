/**
 * Forge namespace — staging area for new factory functionality before it
 * graduates to a governor or query module. See `forge.md` for the original
 * 2.x vision.
 *
 * Currently hosts the developer-JOY prototype facades:
 *  - `engine.q.*` — the unwrap query facade (see `q.ts`)
 *  - `engine.inspect()` — the live state snapshot (see `inspect.ts`)
 *
 * Both are wired onto the engine in `assemblies/engines/parts/engineStart.ts`.
 */

export { buildQueryFacade, queryRegistry } from './q';
export type { QueryFacade } from './q';
export { inspect } from './inspect';
export type { EngineInspection, EngineInspectionCounts } from './inspect';

// Legacy placeholder export retained for prior consumers.
export const forge = {};
export default forge;
