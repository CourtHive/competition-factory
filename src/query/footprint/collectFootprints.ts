// types
import type { FootprintShard, MethodFootprint } from './mutationFootprints';

/** Shared storage-load shape for mutation queues and batches of queries. */
export type RecordFootprint = {
  tournament: boolean;
  shards: FootprintShard[];
  drawIds: string[];
  eventIds: string[];
  wholeRecordMethods: string[];
};

export type FootprintCall = { method: string; params?: Record<string, unknown> };
type ResolveFootprint = (method: string, params?: Record<string, unknown>) => MethodFootprint;
const SHARD_ORDER: FootprintShard[] = ['shell', 'draw', 'drawParticipants', 'eventDraws', 'participants', 'tournament'];

/** Union the declared requirements without changing the existing storage contract or its whole-record fallback. */
export function collectFootprints(methods: FootprintCall[], resolve: ResolveFootprint): RecordFootprint {
  const shards = new Set<FootprintShard>();
  const drawIds = new Set<string>();
  const eventIds = new Set<string>();
  const wholeRecordMethods: string[] = [];
  for (const { method, params } of Array.isArray(methods) ? methods : []) {
    const footprint = resolve(method, params);
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
