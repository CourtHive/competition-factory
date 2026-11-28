import { deleteMatchUpsNotice, modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { modifyDrawEntriesNotice } from '@Mutate/notifications/entriesNotifications';

// constants
import { MISSING_DRAW_DEFINITION, STRUCTURE_NOT_FOUND } from '@Constants/errorConditionConstants';
import { VOLUNTARY_CONSOLATION } from '@Constants/drawDefinitionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import type { DrawDefinition, Event, ItemStructure, Tournament } from '@Types/tournamentTypes';

type ResetVoluntaryConsolationStructureArgs = {
  tournamentRecord?: Tournament;
  drawDefinition: DrawDefinition;
  resetEntries?: boolean;
  event?: Event;
};
// prettier-ignore
export function resetVoluntaryConsolationStructure({ tournamentRecord, drawDefinition, resetEntries, event }: ResetVoluntaryConsolationStructureArgs) {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const structure = drawDefinition.structures?.find((structure) => structure.stage === VOLUNTARY_CONSOLATION) as
    ItemStructure | undefined;

  if (!structure) return { error: STRUCTURE_NOT_FOUND };

  const removedMatchUpIds = structure.matchUps?.map(({ matchUpId }) => matchUpId) ?? [];

  structure.positionAssignments = [];
  structure.seedAssignments = [];
  structure.matchUps = [];

  deleteMatchUpsNotice({
    tournamentId: tournamentRecord?.tournamentId,
    action: 'resetVoluntaryConsolationStructure',
    matchUpIds: removedMatchUpIds,
    drawDefinition,
  });

  if (resetEntries) {
    const before = drawDefinition.entries!.length;
    drawDefinition.entries = drawDefinition.entries!.filter((entry) => entry.entryStage !== VOLUNTARY_CONSOLATION);
    if (drawDefinition.entries.length !== before) {
      modifyDrawEntriesNotice({
        tournamentId: tournamentRecord?.tournamentId,
        eventId: event?.eventId,
        drawDefinition,
      });
    }
  }

  modifyDrawNotice({
    tournamentId: tournamentRecord?.tournamentId,
    eventId: event?.eventId,
    drawDefinition,
    structureIds: [structure.structureId],
  });

  return { ...SUCCESS };
}
