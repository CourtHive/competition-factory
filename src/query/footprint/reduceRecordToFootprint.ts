import { getReferencedParticipants } from '@Query/participants/getReferencedParticipants';
import { MutationFootprint } from './getMutationFootprint';

// types
import { DrawDefinition, Tournament } from '@Types/tournamentTypes';

type ReduceRecordToFootprintArgs = {
  footprint: Pick<MutationFootprint, 'tournament' | 'shards' | 'drawIds' | 'eventIds'>;
  tournamentRecord: Tournament;
};

/**
 * The part of a tournament record a footprint names, as one record the engine can load: the shell, the drawDefinitions
 * the footprint holds (inside their own events), and the participants it holds. What a storage layer that keeps a
 * record in parts would assemble from its rows; a test, or a shadow check that runs a method both ways, builds it from
 * a whole record here.
 *
 * Returns a copy: the record passed in is never changed. A footprint that needs the whole record returns a copy of the
 * whole record.
 */
export function reduceRecordToFootprint({ tournamentRecord, footprint }: ReduceRecordToFootprintArgs): Tournament {
  const record: Tournament = structuredClone(tournamentRecord);
  if (footprint.tournament || footprint.shards.includes('tournament')) return record;

  const drawIds = new Set(footprint.shards.includes('draw') ? footprint.drawIds : []);
  const eventIds = new Set(footprint.eventIds);
  const eventDraws = footprint.shards.includes('eventDraws');
  const keptDraws: DrawDefinition[] = [];

  for (const event of record.events ?? []) {
    if (!event.drawDefinitions) continue;
    event.drawDefinitions = event.drawDefinitions.filter(
      (drawDefinition) => drawIds.has(drawDefinition.drawId) || (eventDraws && eventIds.has(event.eventId)),
    );
    keptDraws.push(...event.drawDefinitions);
  }

  const participants = record.participants ?? [];
  if (footprint.shards.includes('participants')) return record;

  if (footprint.shards.includes('drawParticipants')) {
    const referenced = new Set<string>();
    for (const drawDefinition of keptDraws) {
      for (const { participantId } of getReferencedParticipants({ participants, record: drawDefinition })) {
        referenced.add(participantId);
      }
    }
    record.participants = participants.filter(({ participantId }) => referenced.has(participantId));
  } else {
    record.participants = [];
  }

  return record;
}
