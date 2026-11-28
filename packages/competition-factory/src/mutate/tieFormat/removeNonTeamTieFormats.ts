import { storedNonTeamTieFormat } from '@Validators/nonTeamTieFormat';
import { structuresOf } from '@Helpers/drawTopology/structureMembers';

// constants and types
import type { DrawDefinition, Structure, Tournament } from '@Types/tournamentTypes';
import { INVALID_VALUES, MISSING_TOURNAMENT_RECORD } from '@Constants/errorConditionConstants';
import { TEAM } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import type { ResultType } from '@Types/factoryTypes';

export type RemovedTieFormat = { eventId: string; drawId?: string; structureId?: string };

/**
 * A copy of a record with every tieFormat and tieFormatId removed from its non-TEAM events, draw definitions and
 * structures (nested included), and where each was. A record written before 8.0.0 can hold one there; 8.0.0 refuses to
 * generate over it. TEAM events, their draws and their tie formats are left as they are, and the record passed in is
 * never changed.
 */
export function removeNonTeamTieFormats({ tournamentRecord }: { tournamentRecord: Tournament }): ResultType & {
  tournamentRecord?: Tournament;
  removed?: RemovedTieFormat[];
} {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (typeof tournamentRecord !== 'object') return { error: INVALID_VALUES };

  const removed: RemovedTieFormat[] = [];
  const copy: Tournament = structuredClone(tournamentRecord);

  for (const event of copy.events ?? []) {
    const eventNonTeam = event.eventType !== undefined && event.eventType !== TEAM;
    if (eventNonTeam && (event.tieFormat || event.tieFormatId)) {
      delete event.tieFormat;
      delete event.tieFormatId;
      removed.push({ eventId: event.eventId });
    }
    for (const drawDefinition of event.drawDefinitions ?? []) {
      if (!eventNonTeam && !storedNonTeamTieFormat({ drawDefinition })) continue;
      clearDraw(drawDefinition, event.eventId, removed);
    }
  }

  return { ...SUCCESS, tournamentRecord: copy, removed };
}

function clearDraw(drawDefinition: DrawDefinition, eventId: string, removed: RemovedTieFormat[]) {
  const drawId = drawDefinition.drawId;
  if (drawDefinition.tieFormat || drawDefinition.tieFormatId) {
    delete drawDefinition.tieFormat;
    delete drawDefinition.tieFormatId;
    removed.push({ eventId, drawId });
  }
  const clearStructures = (structures?: Structure[]) => {
    for (const structure of structures ?? []) {
      if (structure.tieFormat || structure.tieFormatId) {
        delete structure.tieFormat;
        delete structure.tieFormatId;
        removed.push({ eventId, drawId, structureId: structure.structureId });
      }
      clearStructures(structuresOf(structure));
    }
  };
  clearStructures(drawDefinition.structures);
}
