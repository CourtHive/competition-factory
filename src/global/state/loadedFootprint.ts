// types
import type { FootprintShard } from '@Query/footprint/mutationFootprints';

export type LoadedFootprint = {
  tournament?: boolean;
  shards: FootprintShard[];
  drawIds?: string[];
  eventIds?: string[];
};

/**
 * Partial-record mode: which part of a tournament record the engine holds, when a storage layer loaded only part of it
 * (`tools.getMutationFootprint`). Keyed by the record object in state, not by tournamentId, so the mark lives and dies
 * with that load: a record installed again by `setState` is unmarked, and is treated as whole, as every record is
 * unless marked. Held beside the record rather than in it, so nothing of it is ever saved.
 *
 * A WeakMap rather than global state: concurrent requests under the async engine each hold their own record objects,
 * so one request's mark cannot reach another's record.
 */
const loaded = new WeakMap<object, LoadedFootprint>();

export function markLoadedFootprint(record: object, footprint?: LoadedFootprint) {
  if (footprint) loaded.set(record, footprint);
  else loaded.delete(record);
}

export function getLoadedFootprint(record?: object): LoadedFootprint | undefined {
  return record ? loaded.get(record) : undefined;
}
