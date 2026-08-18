import { getAccessorValue } from '@Tools/getAccessorValue';

// constants and types
import { INVALID_SCALE_ITEM, INVALID_VALUES, MISSING_PARTICIPANT } from '@Constants/errorConditionConstants';
import { ScaleAttributes, ScaleItem, ResultType } from '@Types/factoryTypes';
import { Participant, EventTypeUnion } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { SCALE } from '@Constants/scaleConstants';
import { isObject } from '@Tools/objects';

export interface ParticipantScaleItemArgs {
  scaleAttributes: ScaleAttributes;
  requireTimeStamp?: boolean;
  participant: Participant;
}

export function participantScaleItem({
  requireTimeStamp,
  scaleAttributes,
  participant,
}: ParticipantScaleItemArgs): ResultType & { scaleItem?: ScaleItem } {
  if (!participant) return { error: MISSING_PARTICIPANT };
  if (!isObject(scaleAttributes)) return { error: INVALID_VALUES };

  participant.timeItems ??= [];
  if (Array.isArray(participant.timeItems)) {
    const { accessor, scaleType, eventType, scaleName } = scaleAttributes;
    const filterType = [SCALE, scaleType, eventType, scaleName].join('.');
    const filteredTimeItems = participant.timeItems
      .filter((timeItem) => timeItem?.itemType === filterType)
      .filter((timeItem) => !requireTimeStamp || timeItem?.itemDate)
      .sort(
        (a, b) =>
          (a.createdAt ? new Date(a.createdAt).getTime() : 0) - (b.createdAt ? new Date(b.createdAt).getTime() : 0),
      );

    const timeItem = filteredTimeItems.pop();

    if (timeItem) {
      const [itemSubject, scaleType, eventType, scaleName] = timeItem.itemType?.split('.') ?? [];

      if (itemSubject !== SCALE) return { error: INVALID_SCALE_ITEM };

      const accessorValue: any = accessor && getAccessorValue({ element: timeItem.itemValue, accessor });
      const scaleValue = accessorValue?.value || timeItem.itemValue;

      const scaleItem = {
        rawValue: accessorValue && timeItem.itemValue,
        eventType: eventType as EventTypeUnion,
        scaleDate: timeItem.itemDate,
        scaleValue,
        scaleName,
        scaleType,
      };
      return { ...SUCCESS, scaleItem };
    }
  }

  return { ...SUCCESS, scaleItem: undefined };
}
