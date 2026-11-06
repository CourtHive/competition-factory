/**
 * Where the engine stamps the factory `{ version, timeStamp }` after a mutation.
 *
 * `tournament` (the default) stamps the tournament record, whatever part of it changed. `modified` stamps what changed:
 * each drawDefinition the call modified, and the tournament only when something outside its draws changed too. A
 * storage layer that keeps a tournament in parts then sees a score entry touch one draw and not the shell.
 *
 * A global-state mode, like `outcomePipeline`: a run configuration, not request state.
 */
export const STAMP_SCOPE_TOURNAMENT = 'tournament';
export const STAMP_SCOPE_MODIFIED = 'modified';

export type StampScope = typeof STAMP_SCOPE_TOURNAMENT | typeof STAMP_SCOPE_MODIFIED;

export const stampScopes: StampScope[] = [STAMP_SCOPE_TOURNAMENT, STAMP_SCOPE_MODIFIED];
