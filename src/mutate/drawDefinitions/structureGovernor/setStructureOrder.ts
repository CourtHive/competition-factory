import { modifyDrawNotice } from '@Mutate/notifications/drawNotifications';
import { decorateResult } from '@Functions/global/decorateResult';
import { isConvertableInteger } from '@Tools/math';
import { numericSortValue } from '@Tools/arrays';

// constants and types
import { INVALID_VALUES, MISSING_DRAW_DEFINITION } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import type { DrawDefinition, Event, Tournament } from '@Types/tournamentTypes';

type SetStructureOrderArgs = {
  /** structureId -> structureOrder; values are validated with isConvertableInteger, so numeric strings pass */
  orderMap?: { [structureId: string]: number | string };
  drawDefinition?: DrawDefinition;
  tournamentRecord?: Tournament;
  disableNotice?: boolean;
  event?: Event;
};
export function setStructureOrder({
  tournamentRecord,
  drawDefinition,
  disableNotice,
  orderMap,
  event,
}: SetStructureOrderArgs): ResultType {
  if (!drawDefinition) return { error: MISSING_DRAW_DEFINITION };
  if (!orderMap || typeof orderMap !== 'object' || !Object.values(orderMap).every((val) => isConvertableInteger(val)))
    return decorateResult({
      result: { error: INVALID_VALUES },
      context: { orderMap },
    });

  drawDefinition.structures ??= [];
  drawDefinition.structures.forEach((structure) => {
    const structureOrder = orderMap[structure.structureId];
    // orderMap values may be numeric strings (validated above); structureOrder is stored as the number
    if (structureOrder) structure.structureOrder = Number(structureOrder);
  });

  drawDefinition.structures.sort((a, b) => numericSortValue(a.structureOrder) - numericSortValue(b.structureOrder));

  if (!disableNotice) {
    modifyDrawNotice({ drawDefinition, tournamentId: tournamentRecord?.tournamentId, eventId: event?.eventId });
  }

  return { ...SUCCESS };
}
