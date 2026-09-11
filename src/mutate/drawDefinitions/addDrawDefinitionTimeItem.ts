import { addDrawNotice } from '@Mutate/notifications/drawNotifications';

// constants
import { DRAW_DEFINITION_NOT_FOUND, INVALID_TIME_ITEM, MISSING_TIME_ITEM } from '@Constants/errorConditionConstants';
import { SUCCESS } from '@Constants/resultConstants';

export function addDrawDefinitionTimeItem({ drawDefinition, timeItem }) {
  if (!drawDefinition) return { error: DRAW_DEFINITION_NOT_FOUND };
  if (!timeItem) return { error: MISSING_TIME_ITEM };

  const timeItemAttributes = timeItem && Object.keys(timeItem);
  const requiredAttributes = ['itemType', 'itemValue'];
  const validTimeItem =
    requiredAttributes.filter((attribute) => timeItemAttributes.includes(attribute)).length ===
    requiredAttributes.length;

  if (!validTimeItem) return { error: INVALID_TIME_ITEM };

  drawDefinition.timeItems ??= [];
  // Honour a `createdAt` already on the caller's timeItem rather than stamping
  // over it — same convention as `addTimeItem`. timeItem `createdAt` is an
  // ordering key, so an entry recorded at a venue and synced later must keep its
  // own time. Inert when nothing is supplied.
  timeItem.createdAt ??= new Date().toISOString();
  drawDefinition.timeItems.push(timeItem);

  addDrawNotice({ drawDefinition });

  return { ...SUCCESS };
}
