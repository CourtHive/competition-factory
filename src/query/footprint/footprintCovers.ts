// types
import type { LoadedFootprint } from '@Global/state/loadedFootprint';
import type { FootprintShard, MethodFootprint } from './mutationFootprints';
import type { Tournament } from '@Types/tournamentTypes';

type FootprintCoversArgs = {
  required: MethodFootprint;
  loaded: LoadedFootprint;
  tournamentRecord: Tournament;
};

/**
 * Whether a loaded partial record holds everything a method's footprint needs. Draws are checked against the record
 * itself (a draw is either there or not); the event's draws and the participants, whose absence cannot be seen in the
 * record, are checked against what the loader declared it loaded.
 *
 * Returns the shards that are missing; an empty list means the method may run.
 */
export function footprintCovers({ required, loaded, tournamentRecord }: FootprintCoversArgs): string[] {
  const has = (shard: FootprintShard) => loaded.shards.includes(shard);
  if (loaded.tournament || has('tournament')) return [];
  if (required.shards.includes('tournament')) return ['tournament'];

  const recordDrawIds = new Set(
    (tournamentRecord?.events ?? []).flatMap((event) => (event.drawDefinitions ?? []).map(({ drawId }) => drawId)),
  );
  const loadedEventIds = new Set(has('eventDraws') ? (loaded.eventIds ?? []) : []);
  // the draws whose referenced participants the loader declared it loaded
  const participantDrawIds = new Set([
    ...(loaded.drawIds ?? []),
    ...(tournamentRecord?.events ?? [])
      .filter(({ eventId }) => loadedEventIds.has(eventId))
      .flatMap((event) => (event.drawDefinitions ?? []).map(({ drawId }) => drawId)),
  ]);

  const missing: string[] = [];
  const requiredDrawIds = required.drawIds ?? [];
  for (const shard of required.shards) {
    if (shard === 'shell') continue;
    if (shard === 'draw' && requiredDrawIds.every((drawId) => recordDrawIds.has(drawId))) continue;
    if (shard === 'eventDraws' && (required.eventIds ?? []).every((eventId) => loadedEventIds.has(eventId))) continue;
    if (shard === 'participants' && has('participants')) continue;
    if (
      shard === 'drawParticipants' &&
      (has('participants') ||
        (has('drawParticipants') && requiredDrawIds.every((drawId) => participantDrawIds.has(drawId))))
    )
      continue;
    missing.push(shard);
  }
  return missing;
}
