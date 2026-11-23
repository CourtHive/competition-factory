import { FootprintContext, getMethodFootprint } from './mutationFootprints';
import type { RecordFootprint } from './collectFootprints';
import { collectFootprints } from './collectFootprints';

export type MutationFootprint = RecordFootprint;

type GetMutationFootprintArgs = FootprintContext & {
  methods: { method: string; params?: Record<string, any> }[];
};

/**
 * The footprint of an executionQueue: the union of its methods' footprints (`mutationFootprints.ts`). A storage
 * layer that keeps a tournament in parts loads this much before running the queue and refuses nothing it did not
 * load; when `tournament` is true it loads the whole record, as it would without footprints at all.
 *
 * Pure: reads only `methods` and their params, never engine state, so a server can call it before it has fetched
 * anything. A method with no declared footprint, or one whose params leave its scope open (no `drawId`), needs the
 * whole record.
 *
 * With several tournaments loaded, ask once per tournament with `tournamentId`: a declared method that runs against
 * another tournament (`params.tournamentId`, else `activeTournamentId`) needs only this one's shell, and
 * `bulkMatchUpStatusUpdate` needs the draws of this tournament's outcomes. Without `tournamentId` the answer is the
 * queue's whole reach, and outcomes across tournaments need the whole record.
 */
export function getMutationFootprint({
  activeTournamentId,
  outcomePipeline,
  tournamentId,
  methods,
}: GetMutationFootprintArgs): MutationFootprint {
  return collectFootprints(methods, (method, params) =>
    getMethodFootprint(method, params, { outcomePipeline, tournamentId, activeTournamentId }),
  );
}
