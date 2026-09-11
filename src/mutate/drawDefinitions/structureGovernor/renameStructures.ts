import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { isObject } from '@Tools/objects';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type RenameStructuresArgs = {
  drawDefinition: DrawDefinition;
  tournamentRecord?: Tournament;
  disableNotice?: boolean;
  event?: Event;
  structureDetails: { structureId: string; structureName: string }[];
};

export function renameStructures({
  drawDefinition,
  tournamentRecord,
  disableNotice,
  event,
  structureDetails,
}: RenameStructuresArgs): ResultType {
  if (!Array.isArray(structureDetails)) return { error: INVALID_VALUES };
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };

  const detailMap = Object.assign(
    {},
    ...structureDetails
      .map((detail) => {
        if (!isObject(detail)) return undefined;
        const { structureId, structureName } = detail ?? {};
        if (!structureId || !structureName) return undefined;
        return { [structureId]: structureName };
      })
      .filter(Boolean),
  );

  if (!Object.values(detailMap).length) {
    return { error: MISSING_VALUE };
  }

  const renamedStructureIds: string[] = [];
  for (const structure of drawDefinition.structures ?? []) {
    const structureName = detailMap[structure.structureId];
    if (structureName) {
      structure.structureName = structureName;
      renamedStructureIds.push(structure.structureId);
    }
    for (const subStructure of structure.structures ?? []) {
      const subStructureName = detailMap[subStructure.structureId];
      if (subStructureName) {
        subStructure.structureName = subStructureName;
        renamedStructureIds.push(subStructure.structureId);
      }
    }
  }

  // Renaming a structure changes drawDefinition.structures[].structureName in
  // place; dispatch MODIFY_DRAW_DEFINITION so the change is observable and the
  // record is marked modified (persistence).
  if (!disableNotice && renamedStructureIds.length) {
    modifyDrawNotice({
      drawDefinition,
      tournamentId: tournamentRecord?.tournamentId,
      structureIds: renamedStructureIds,
      eventId: event?.eventId,
    });
  }

  return { ...SUCCESS };
}
