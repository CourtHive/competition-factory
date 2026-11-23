import { getQueryMethodFootprint } from './queryFootprints';
import { collectFootprints } from './collectFootprints';

// types
import type { FootprintCall, RecordFootprint } from './collectFootprints';
import type { FootprintContext } from './mutationFootprints';

export type QueryFootprint = RecordFootprint;

/**
 * Pure pre-load plan for one or more queries, using the same shards/reducer/loadedFootprint guard as mutations.
 * Unclassified queries or unresolved event/draw scope require the whole record. This does not authorize a query,
 * classify a mutation as read-only, fetch shards, or minimize the returned action payload.
 */
export function getQueryFootprint({
  activeTournamentId,
  tournamentId,
  methods,
}: FootprintContext & { methods: FootprintCall[] }): QueryFootprint {
  return collectFootprints(methods, (method, params) =>
    getQueryMethodFootprint(method, params, { tournamentId, activeTournamentId }),
  );
}
