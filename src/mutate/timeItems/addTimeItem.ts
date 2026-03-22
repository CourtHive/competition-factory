import { findTournamentParticipant } from '@Acquire/findTournamentParticipant';
import { deriveElement } from '@Query/base/deriveElement';
import { getTimeItemValues } from './getTimeItemValues';
import { addNotice } from '@Global/state/globalState';
import { isValidDateString } from '@Tools/dateTime';
import { isObject, isString } from '@Tools/objects';
import { getTimeItem } from '@Query/base/timeItems';

// constants and types
import { DrawDefinition, Event, TimeItem, Tournament } from '@Types/tournamentTypes';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import {
  EVENT_NOT_FOUND,
  INVALID_DATE,
  INVALID_TIME_ITEM,
  MISSING_PARTICIPANT_ID,
  MISSING_TIME_ITEM,
  MISSING_TOURNAMENT_RECORD,
  MISSING_VALUE,
} from '@Constants/errorConditionConstants';

type AddTimeItemArgs = {
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  removePriorValues?: boolean;
  duplicateValues?: boolean;
  participantId?: string;
  creationTime?: boolean;
  timeItem: TimeItem;
  event?: Event;
  element: any;
};

export function addTimeItem(params: AddTimeItemArgs) {
  const { duplicateValues = true, creationTime = true, removePriorValues, timeItem } = params;
  if (!timeItem) return { error: MISSING_TIME_ITEM };

  const element = deriveElement(params);
  if (element.error) return element;

  const validTimeItem =
    isObject(timeItem) && isString(timeItem.itemType) && Object.keys(timeItem).includes('itemValue');
  if (!validTimeItem) return { error: INVALID_TIME_ITEM };

  // Validate itemDate format if provided as a string
  if (timeItem.itemDate && typeof timeItem.itemDate === 'string' && !isValidDateString(timeItem.itemDate)) {
    return { error: INVALID_DATE };
  }

  if (!element.timeItems) {
    element.timeItems = [];
  } else if (hasEquivalentTimeItem({ element, duplicateValues, timeItem })) {
    return { ...SUCCESS };
  }

  if (timeItem.itemSubTypes && !timeItem.itemSubTypes.length) delete timeItem.itemSubTypes;

  if (creationTime) {
    const createdAt = new Date().toISOString();
    Object.assign(timeItem, { createdAt });
  }

  if (removePriorValues) element.timeItems = element.timeItems.filter(({ itemType }) => timeItem.itemType !== itemType);

  // if priorValues are being remvoed and there is no new itemValue, do not add by pushing
  const doNotAdd = removePriorValues && !timeItem.itemValue;
  if (!doNotAdd) element.timeItems.push(timeItem);

  return { ...SUCCESS };
}

function hasEquivalentTimeItem({ element, duplicateValues, timeItem }) {
  // check if timeItem with equivalent value already exists
  const { itemType, itemSubTypes, itemValue } = timeItem;
  const existingTimeItem =
    itemType &&
    getTimeItem({
      itemSubTypes,
      itemType,
      element,
    })?.timeItem;

  return (
    existingTimeItem && JSON.stringify(existingTimeItem?.itemValue) === JSON.stringify(itemValue) && !duplicateValues
  );
}

type AddParticipantTimeItemArgs = {
  tournamentRecord: Tournament;
  removePriorValues?: boolean;
  duplicateValues?: boolean;
  creationTime?: boolean;
  participantId: string;
  timeItem: TimeItem;
};

export function addParticipantTimeItem({
  creationTime = true,
  removePriorValues,
  tournamentRecord,
  duplicateValues,
  participantId,
  timeItem,
}: AddParticipantTimeItemArgs) {
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  if (!participantId) return { error: MISSING_PARTICIPANT_ID };

  const result = findTournamentParticipant({ tournamentRecord, participantId });
  if (result.error) return result;

  return addTimeItem({
    element: result.participant,
    removePriorValues,
    duplicateValues,
    creationTime,
    timeItem,
  });
}

export function addTournamentTimeItem(params) {
  const { removePriorValues, tournamentRecord, duplicateValues, creationTime, timeItem } = params;
  if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };
  const result = addTimeItem({
    element: tournamentRecord,
    removePriorValues,
    duplicateValues,
    creationTime,
    timeItem,
  });
  if (result.error) return result;

  const timeItemValues = getTimeItemValues({ element: tournamentRecord });
  addNotice({
    payload: {
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      timeItemValues,
    },
    topic: MODIFY_TOURNAMENT_DETAIL,
  });

  return result;
}

export function addEventTimeItem(params) {
  const { removePriorValues, duplicateValues, creationTime, timeItem, event } = params;
  if (!event) return { error: EVENT_NOT_FOUND };
  return addTimeItem({
    removePriorValues,
    duplicateValues,
    element: event,
    creationTime,
    timeItem,
  });
}

export function resetTimeItems({ element }) {
  if (!element) return { error: MISSING_VALUE };
  element.timeItems = [];
  return { ...SUCCESS };
}
