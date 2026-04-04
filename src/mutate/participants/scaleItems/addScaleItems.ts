import { addDrawDefinitionTimeItem } from '@Mutate/drawDefinitions/addDrawDefinitionTimeItem';
import { addEventTimeItem, addTournamentTimeItem } from '@Mutate/timeItems/addTimeItem';
import { participantScaleItem } from '@Query/participant/participantScaleItem';
import { decorateResult } from '@Functions/global/decorateResult';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice, getTopics } from '@Global/state/globalState';
import { definedAttributes } from '@Tools/definedAttributes';
import { isValidDateString } from '@Tools/dateTime';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { ADD_SCALE_ITEMS, AUDIT, MODIFY_PARTICIPANTS } from '@Constants/topicConstants';
import { TEAM_PARTICIPANT } from '@Constants/participantConstants';
import { TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { Participant, Tournament } from '@Types/tournamentTypes';
import { ScaleItem, ResultType } from '@Types/factoryTypes';
import { TEAM_EVENT } from '@Constants/eventConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { SCALE } from '@Constants/scaleConstants';
import {
  INVALID_DATE,
  INVALID_SCALE_ITEM,
  MISSING_PARTICIPANT,
  MISSING_PARTICIPANTS,
  NO_MODIFICATIONS_APPLIED,
  PARTICIPANT_NOT_FOUND,
  VALUE_UNCHANGED,
} from '@Constants/errorConditionConstants';

type SetParticipantScaleItemArgs = {
  tournamentRecord: Tournament;
  removePriorValues?: boolean;
  participantId: string;
  scaleItem?: ScaleItem;
};

export function setParticipantScaleItem(params: SetParticipantScaleItemArgs) {
  const { removePriorValues, tournamentRecord, participantId, scaleItem } = params;
  let equivalentValue, participant;

  if (!isValidScaleItem({ scaleItem })) return { error: INVALID_SCALE_ITEM };

  if (participantId && Array.isArray(tournamentRecord.participants)) {
    participant = tournamentRecord.participants.find((participant) => participant.participantId === participantId);

    if (participant) {
      if (participant.participantType === TEAM_PARTICIPANT && scaleItem?.eventType !== TEAM_EVENT) {
        return { error: INVALID_SCALE_ITEM };
      }

      const result = addParticipantScaleItem({
        removePriorValues,
        participant,
        scaleItem,
      });
      if (result.error) return result;

      equivalentValue = !result.valueChanged;

      const { topics } = getTopics();
      if (topics.includes(MODIFY_PARTICIPANTS)) {
        addNotice({
          topic: MODIFY_PARTICIPANTS,
          payload: {
            tournamentId: tournamentRecord.tournamentId,
            participants: [participant],
          },
        });
      }
    }
  }

  return (
    (equivalentValue && {
      ...SUCCESS,
      info: VALUE_UNCHANGED,
      existingValue: scaleItem?.scaleValue,
    }) ||
    (participant && { ...SUCCESS, newValue: scaleItem?.scaleValue }) || {
      error: PARTICIPANT_NOT_FOUND,
    }
  );
}

type SetParticipantScaleItemsArgs = {
  scaleItemsWithParticipantIds: {
    scaleItems: ScaleItem[];
    participantId: string;
  }[];
  context?: { [key: string]: any };
  tournamentRecord: Tournament;
  removePriorValues?: boolean;
  auditData?: any;
};

export function setParticipantScaleItems(params: SetParticipantScaleItemsArgs) {
  const { scaleItemsWithParticipantIds = [], removePriorValues, tournamentRecord, auditData, context } = params;

  const paramsCheck = requireParams({ tournamentRecord }, [TOURNAMENT_RECORD]);
  if (paramsCheck.error) return paramsCheck;
  if (!tournamentRecord.participants) return { error: MISSING_PARTICIPANTS };

  const participantScaleItemsMap: any = buildScaleItemsMap(scaleItemsWithParticipantIds);
  if (participantScaleItemsMap.error) return participantScaleItemsMap;

  const { modificationsApplied, modifiedParticipants, error } = applyScaleItemsToParticipants({
    participants: tournamentRecord.participants,
    participantScaleItemsMap,
    removePriorValues,
  });
  if (error) return error;

  const info = modificationsApplied ? undefined : NO_MODIFICATIONS_APPLIED;
  const { topics } = getTopics();
  if (topics.includes(MODIFY_PARTICIPANTS) && modificationsApplied) {
    addNotice({
      topic: MODIFY_PARTICIPANTS,
      payload: {
        tournamentId: tournamentRecord.tournamentId,
        participants: modifiedParticipants,
      },
    });
  }

  addContextTimeItem({ context, tournamentRecord });

  if (auditData && topics.includes(AUDIT)) {
    addNotice({ topic: AUDIT, payload: auditData });
  }

  return definedAttributes({ ...SUCCESS, modificationsApplied, info });
}

function isValidScaleItem({ scaleItem }) {
  const scaleItemAttributes = scaleItem && Object.keys(scaleItem);
  const requiredAttributes = ['scaleType', 'eventType', 'scaleName'];
  const validScaleItem =
    requiredAttributes.filter((attribute) => scaleItemAttributes?.includes(attribute)).length ===
    requiredAttributes.length;
  return !!validScaleItem;
}

export function addParticipantScaleItem({ removePriorValues, participant, scaleItem }): ResultType & {
  valueChanged?: boolean;
  newValue?: any;
} {
  if (!participant) {
    return { error: MISSING_PARTICIPANT };
  }

  const scaleItemAttributes = scaleItem && Object.keys(scaleItem);
  const requiredAttributes = ['scaleType', 'eventType', 'scaleName'];
  const validScaleItem =
    requiredAttributes.filter((attribute) => scaleItemAttributes.includes(attribute) && scaleItem[attribute]).length ===
    requiredAttributes.length;

  if (!validScaleItem) return { error: INVALID_SCALE_ITEM };

  const createdAt = new Date().toISOString();
  participant.timeItems ??= [];

  const { scaleItem: existingScaleItem } = participantScaleItem({
    scaleAttributes: scaleItem,
    participant,
  });

  const isUndefined = (value) => [undefined, null, ''].includes(value);

  const valueChanged =
    !(isUndefined(existingScaleItem?.scaleValue) && isUndefined(scaleItem.scaleValue)) &&
    JSON.stringify(existingScaleItem?.scaleValue) !== JSON.stringify(scaleItem.scaleValue);

  if (valueChanged) {
    // Validate scaleDate format if provided
    if (scaleItem.scaleDate && typeof scaleItem.scaleDate === 'string' && !isValidDateString(scaleItem.scaleDate)) {
      return { error: INVALID_DATE };
    }

    const { scaleType, eventType, scaleName } = scaleItem;
    const itemType = [SCALE, scaleType, eventType, scaleName].join('.');

    const timeItem = definedAttributes({
      itemValue: scaleItem.scaleValue,
      itemDate: scaleItem.scaleDate,
      createdAt,
      itemType,
    });

    // if there is a unique identifier for the scale
    if (scaleItem.scaleId) {
      timeItem.itemSubTypes = [scaleItem.scaleId];
    }

    if (removePriorValues) {
      participant.timeItems = participant.timeItems.filter((timeItem) => timeItem.itemType !== itemType);
    }

    participant.timeItems.push(timeItem);
  }

  return { ...SUCCESS, valueChanged, newValue: scaleItem.scaleValue };
}

function buildScaleItemsMap(scaleItemsWithParticipantIds) {
  const participantScaleItemsMap = {};
  for (const item of scaleItemsWithParticipantIds) {
    const participantId = item?.participantId;
    if (Array.isArray(item?.scaleItems)) {
      for (const scaleItem of item.scaleItems) {
        if (isValidScaleItem({ scaleItem })) {
          if (!Array.isArray(participantScaleItemsMap[participantId])) {
            participantScaleItemsMap[participantId] = [];
          }
          participantScaleItemsMap[participantId].push(scaleItem);
        } else {
          return { error: INVALID_SCALE_ITEM };
        }
      }
    }
  }
  return participantScaleItemsMap;
}

function applyScaleItemsToParticipants({ participants, participantScaleItemsMap, removePriorValues }) {
  let modificationsApplied = 0;
  const modifiedParticipants: Participant[] = [];

  for (const participant of participants) {
    const { participantId } = participant ?? {};
    if (Array.isArray(participantScaleItemsMap[participantId])) {
      for (const scaleItem of participantScaleItemsMap[participantId]) {
        if (participant.participantType === TEAM_PARTICIPANT && scaleItem?.eventType !== TEAM_EVENT) {
          return {
            error: decorateResult({
              context: { participantId, scaleItem, participantType: participant.participantType },
              info: 'Invalid participantType for eventType',
              result: { error: INVALID_SCALE_ITEM },
            }),
            modificationsApplied,
            modifiedParticipants,
          };
        }
        addParticipantScaleItem({ participant, scaleItem, removePriorValues });
        modifiedParticipants.push(participant);
        modificationsApplied++;
      }
    }
  }

  return { modificationsApplied, modifiedParticipants, error: undefined };
}

function addContextTimeItem({ context, tournamentRecord }) {
  if (!context) return;

  const { eventId, drawId, ...itemValue } = context;
  const itemSubTypes = itemValue.scaleAttributes?.scaleType && [itemValue.scaleAttributes.scaleType];
  if (!Object.keys(itemValue).length) return;

  const timeItem: any = {
    itemType: ADD_SCALE_ITEMS,
    itemValue,
  };
  if (itemSubTypes) timeItem.itemSubTypes = itemSubTypes;

  if (drawId || eventId) {
    const { drawDefinition, event } = findEvent({
      tournamentRecord,
      eventId,
      drawId,
    });

    if (drawId) {
      addDrawDefinitionTimeItem({ drawDefinition, timeItem });
    }
    if (eventId) {
      addEventTimeItem({ event, timeItem });
    }
  } else {
    addTournamentTimeItem({ tournamentRecord, timeItem });
  }
}
