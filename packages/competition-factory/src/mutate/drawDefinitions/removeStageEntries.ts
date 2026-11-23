import { modifyDrawEntriesNotice } from '@Mutate/notifications/entriesNotifications';

// constants and types
import { MISSING_DRAW_DEFINITION, INVALID_VALUES } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';

type RemoveStageEntriesArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  entryStage: string;
  event?: Event;
};

/**
 * Remove all draw entries for a given entryStage.
 * Unlike removeDrawEntries (which filters by participantId across all stages),
 * this removes entries specifically by their entryStage field.
 * MODIFY_DRAW_ENTRIES when an entry was removed; a stage with no entries sends nothing.
 */
export function removeStageEntries({ tournamentRecord, drawDefinition, entryStage, event }: RemoveStageEntriesArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!entryStage) return { error: INVALID_VALUES };

  if (drawDefinition.entries) {
    const count = drawDefinition.entries.length;
    drawDefinition.entries = drawDefinition.entries.filter((e) => e.entryStage !== entryStage);
    if (drawDefinition.entries.length !== count) {
      modifyDrawEntriesNotice({
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event?.eventId,
        drawDefinition,
      });
    }
  }

  return { ...SUCCESS };
}
