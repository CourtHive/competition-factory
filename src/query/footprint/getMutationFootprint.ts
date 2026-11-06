import { FootprintContext, FootprintShard, getMethodFootprint } from './mutationFootprints';

export type MutationFootprint = {
  // true when any method needs the whole record; `shards`, `drawIds` and `eventIds` then say nothing more
  tournament: boolean;
  shards: FootprintShard[];
  drawIds: string[];
  eventIds: string[];
  // the methods that needed the whole record: no declared footprint, or params that left the scope open
  wholeRecordMethods: string[];
};

type GetMutationFootprintArgs = FootprintContext & {
  methods: { method: string; params?: Record<string, any> }[];
};

const SHARD_ORDER: FootprintShard[] = ['shell', 'draw', 'drawParticipants', 'eventDraws', 'participants', 'tournament'];

/**
 * The footprint of an executionQueue: the union of its methods' footprints (`mutationFootprints.ts`). A storage
 * layer that keeps a tournament in parts loads this much before running the queue and refuses nothing it did not
 * load; when `tournament` is true it loads the whole record, as it would without footprints at all.
 *
 * Pure: reads only `methods` and their params, never engine state, so a server can call it before it has fetched
 * anything. A method with no declared footprint, or one whose params leave its scope open (no `drawId`), needs the
 * whole record.
 */
export function getMutationFootprint({ methods, outcomePipeline }: GetMutationFootprintArgs): MutationFootprint {
  const shards = new Set<FootprintShard>();
  const drawIds = new Set<string>();
  const eventIds = new Set<string>();
  const wholeRecordMethods: string[] = [];

  for (const { method, params } of Array.isArray(methods) ? methods : []) {
    const footprint = getMethodFootprint(method, params, { outcomePipeline });
    if (footprint.shards.includes('tournament') && !wholeRecordMethods.includes(method))
      wholeRecordMethods.push(method);
    footprint.shards.forEach((shard) => shards.add(shard));
    footprint.drawIds?.forEach((drawId) => drawIds.add(drawId));
    footprint.eventIds?.forEach((eventId) => eventIds.add(eventId));
  }

  const tournament = !methods?.length || shards.has('tournament');
  return {
    shards: tournament ? ['tournament'] : SHARD_ORDER.filter((shard) => shards.has(shard)),
    drawIds: tournament ? [] : [...drawIds],
    eventIds: tournament ? [] : [...eventIds],
    wholeRecordMethods,
    tournament,
  };
}
