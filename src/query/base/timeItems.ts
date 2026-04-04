import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { requireParams } from '@Helpers/parameters/requireParams';
import { makeDeepCopy } from '@Tools/makeDeepCopy';
import { deriveElement } from './deriveElement';

// constants and types
import { DrawDefinition, Event, TimeItem, Tournament } from '@Types/tournamentTypes';
import { TOURNAMENT_RECORD, PARTICIPANT_ID } from '@Constants/attributeConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  INVALID_VALUES,
  MISSING_DRAW_ID,
  MISSING_EVENT,
  MISSING_TIME_ITEMS,
  MISSING_TOURNAMENT_RECORD,
  NOT_FOUND,
} from '@Constants/errorConditionConstants';

type TimeItemResult = {
  timeItem?: TimeItem;
  previousItems?: any;
  success?: boolean;
  code?: string;
  info?: any;
};

type TimeItemArgs = {
  returnPreviousValues?: boolean;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  itemSubTypes?: string[];
  participantId?: string;
  itemType: string;
  event?: Event;
  element: any;
};

export function getTimeItem(params: TimeItemArgs): TimeItemResult & ResultType {
  const { returnPreviousValues, itemSubTypes, itemType } = params;
  const element = deriveElement(params);
  if (element.error) return element;

  if (itemSubTypes && !Array.isArray(itemSubTypes)) return { error: INVALID_VALUES, context: { itemSubTypes } };
  if (!Array.isArray(element.timeItems)) return { error: MISSING_TIME_ITEMS };

  const filteredSorted = element.timeItems
    .filter((timeItem) => timeItem?.itemType === itemType)
    .filter(
      (timeItem) => !itemSubTypes?.length || itemSubTypes.some((subType) => timeItem?.itemSubTypes?.includes(subType)),
    )
    .sort((a, b) => {
      const aDate = new Date(a.createdAt || undefined).getTime();
      const bDate = new Date(b.createdAt || undefined).getTime();
      return aDate - bDate;
    });

  const timeItem = makeDeepCopy(filteredSorted.pop(), false, true);

  if (timeItem) {
    const result = { timeItem, ...SUCCESS };
    if (returnPreviousValues) Object.assign(result, { previousItems: filteredSorted });
    return result;
  } else {
    return { info: NOT_FOUND };
  }
}

export function getDrawDefinitionTimeItem({ returnPreviousValues, drawDefinition, itemSubTypes, itemType }) {
  if (!drawDefinition) return { error: MISSING_DRAW_ID };
  if (!drawDefinition.timeItems) return { info: NOT_FOUND };

  const { timeItem, previousItems, info } = getTimeItem({
    element: drawDefinition,
    returnPreviousValues,
    itemSubTypes,
    itemType,
  });
  return (timeItem && { timeItem, previousItems }) || { info };
}

type GetEventTimeItemArgs = {
  returnPreviousValues?: boolean;
  itemSubTypes?: string[];
  itemType: string;
  event: Event;
};
export function getEventTimeItem({ returnPreviousValues, itemSubTypes, itemType, event }: GetEventTimeItemArgs) {
  if (!event) return { error: MISSING_EVENT };
  if (!event.timeItems) return { info: NOT_FOUND };

  const { timeItem, previousItems, info } = getTimeItem({
    returnPreviousValues,
    element: event,
    itemSubTypes,
    itemType,
  });
  return (timeItem && { timeItem, previousItems }) || { info };
}

type GetTournamentTimeItemArgs = {
  returnPreviousValues?: boolean;
  tournamentRecord: Tournament;
  itemSubTypes?: string[];
  itemType: string;
};
export function getTournamentTimeItem({
  returnPreviousValues,
  tournamentRecord,
  itemSubTypes,
  itemType,
}: GetTournamentTimeItemArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!tournamentRecord.timeItems) return { info: NOT_FOUND };

  const { timeItem, previousItems, info } = getTimeItem({
    element: tournamentRecord,
    returnPreviousValues,
    itemSubTypes,
    itemType,
  });
  return (timeItem && { timeItem, previousItems }) || { info };
}

export function getParticipantTimeItem({
  returnPreviousValues,
  tournamentRecord,
  participantId,
  itemSubTypes,
  itemType,
}) {
  const paramsCheck = requireParams({ tournamentRecord, participantId }, [TOURNAMENT_RECORD, PARTICIPANT_ID]);
  if (paramsCheck.error) return paramsCheck;

  const result = findTournamentParticipant({ tournamentRecord, participantId });
  if (result.error) return result;

  const { participant } = result;
  if (!participant?.timeItems) return { info: NOT_FOUND };

  const { timeItem, previousItems, info } = getTimeItem({
    element: result.participant,
    returnPreviousValues,
    itemSubTypes,
    itemType,
  });

  return (timeItem && { timeItem, previousItems }) || { info };
}
