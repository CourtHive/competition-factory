import { isObject } from '@Tools/objects';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION, MISSING_VALUE } from '@Constants/errorConditionConstants';
import { DrawDefinition } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type RenameStructuresArgs = {
  drawDefinition: DrawDefinition;
  structureDetails: { structureId: string; structureName: string }[];
};

export function renameStructures({ drawDefinition, structureDetails }: RenameStructuresArgs): ResultType {
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

  for (const structure of drawDefinition.structures ?? []) {
    const structureName = detailMap[structure.structureId];
    if (structureName) structure.structureName = structureName;
    if (structure.structures) {
      for (const subStructure of structure.structures) {
        const subStructureName = detailMap[subStructure.structureId];
        if (subStructureName) subStructure.structureName = subStructureName;
      }
    }
  }

  return { ...SUCCESS };
}
