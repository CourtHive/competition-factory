import { addDrawDefinitionTimeItem } from '@Mutate/drawDefinitions/addDrawDefinitionTimeItem';
import { modifyParticipantsNotice } from '@Mutate/notifications/participantNotifications';
import { addEventTimeItem, addTournamentTimeItem } from '@Mutate/timeItems/addTimeItem';
import { participantScaleItem } from '@Query/participant/participantScaleItem';
import { decorateResult } from '@Functions/global/decorateResult';
import { requireParams } from '@Helpers/parameters/requireParams';
import { addNotice, getTopics } from '@Global/state/globalState';
import { definedAttributes } from '@Tools/definedAttributes';
import { isValidDateString } from '@Tools/dateTime';
import { findEvent } from '@Acquire/findEvent';
import { planAppend, planFieldWrite } from '@Mutate/planCommit';
import { nowIso } from '@Tools/clock';

// constants and types
import { ADD_SCALE_ITEMS, AUDIT } from '@Constants/topicConstants';
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
  let committedValue: ScaleItem['scaleValue'];

  if (!scaleItem || !isValidScaleItem({ scaleItem })) return { error: INVALID_SCALE_ITEM };

  if (participantId && Array.isArray(tournamentRecord.participants)) {
    participant = tournamentRecord.participants.find((participant) => participant.participantId === participantId);

    if (participant) {
      if (ineligibleTeamScale(participant, scaleItem)) {
        return { error: INVALID_SCALE_ITEM };
      }

      const result = addParticipantScaleItem({
        removePriorValues,
        participant,
        scaleItem,
      });
      if (result.error) return result;

      equivalentValue = !result.valueChanged;
      committedValue = result.newValue;

      // announced (and so factory-stamped) whether or not anything subscribes, and only when the value changed:
      // gated on the subscription, the stored record depended on who was listening
      if (result.valueChanged) {
        modifyParticipantsNotice({
          tournamentId: tournamentRecord.tournamentId,
          participants: [participant],
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
    (participant && { ...SUCCESS, newValue: committedValue }) || {
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
  // announced (and so factory-stamped) whether or not anything subscribes: gated on the subscription, the stored
  // record depended on who was listening
  const { topics } = getTopics();
  if (modificationsApplied) {
    modifyParticipantsNotice({
      tournamentId: tournamentRecord.tournamentId,
      participants: modifiedParticipants,
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

type ScaleItemWriteArgs = {
  participant: Participant;
  scaleItem: ScaleItem & { createdAt?: string; scaleId?: string };
  removePriorValues?: boolean;
};

function ineligibleTeamScale(participant: Participant, scaleItem: ScaleItem) {
  return participant.participantType === TEAM_PARTICIPANT && scaleItem.eventType !== TEAM_EVENT;
}

// Public single-item eligibility also applies to each destination of a ratings run.
export function planEligibleScaleItem(params: ScaleItemWriteArgs, appends?: PlannedAppends) {
  if (ineligibleTeamScale(params.participant, params.scaleItem)) {
    return { error: INVALID_SCALE_ITEM };
  }
  return planParticipantScaleItem(params, appends);
}

export function addParticipantScaleItem(params: ScaleItemWriteArgs): ResultType & {
  valueChanged?: boolean;
  newValue?: ScaleItem['scaleValue'];
} {
  const plan = planParticipantScaleItem(params);
  if ('error' in plan) return plan;
  plan.commit?.();
  const newValue = plan.valueChanged ? params.participant.timeItems?.at(-1)?.itemValue : params.scaleItem.scaleValue;
  return { ...SUCCESS, valueChanged: plan.valueChanged, newValue };
}

type TimeItems = NonNullable<Participant['timeItems']>;
type PlannedAppends = Map<TimeItems, TimeItems>;

function planParticipantScaleItem(
  { removePriorValues, participant, scaleItem }: ScaleItemWriteArgs,
  appends?: PlannedAppends,
) {
  if (!participant) {
    return { error: MISSING_PARTICIPANT };
  }

  if (!isValidScaleItem({ scaleItem }) || !scaleItem.scaleType || !scaleItem.eventType || !scaleItem.scaleName) {
    return { error: INVALID_SCALE_ITEM };
  }

  // Honour a `createdAt` already on the caller's scaleItem rather than stamping
  // over it. No new parameter is needed here — the caller already supplies the
  // object, so this is the same shape as `participantId ??= UUID()`.
  //
  // This is the ordering case that matters most: `participantScaleItem` and
  // `getScaleValues` sort a participant's scale timeItems by `createdAt` to
  // resolve the CURRENT rating. A rating recorded at a venue and synced later
  // must carry its own time or it sorts as though it happened at sync time —
  // and would wrongly supersede a rating actually set after it.
  //
  // Distinct from `scaleItem.scaleDate`, which is the date the rating APPLIES
  // to; `createdAt` is when it was recorded.
  const createdAt = scaleItem.createdAt ?? nowIso();

  const existing = participant.timeItems;
  // Borrowed participants can share a time-item array. A later plan must see
  // preceding proposed values when deciding whether a second append is needed.
  const pending = existing && appends?.get(existing);
  const { scaleItem: existingScaleItem } = participantScaleItem({
    scaleAttributes: scaleItem,
    participant:
      existing && pending
        ? { participantId: participant.participantId, timeItems: existing.concat(pending) }
        : participant,
  });

  const isUndefined = (value: unknown) => value == null || value === '';

  const valueChanged =
    !(isUndefined(existingScaleItem?.scaleValue) && isUndefined(scaleItem.scaleValue)) &&
    JSON.stringify(existingScaleItem?.scaleValue) !== JSON.stringify(scaleItem.scaleValue);

  if (!valueChanged) {
    // A successful empty-on-empty call historically initialized the list, without a notice.
    return { valueChanged, commit: existing == null ? planFieldWrite(participant, 'timeItems', []) : undefined };
  }
  if (scaleItem.scaleDate && typeof scaleItem.scaleDate === 'string' && !isValidDateString(scaleItem.scaleDate)) {
    return { error: INVALID_DATE };
  }

  const itemType = [SCALE, scaleItem.scaleType, scaleItem.eventType, scaleItem.scaleName].join('.');
  const timeItem = definedAttributes({
    itemValue: scaleItem.scaleValue,
    itemDate: scaleItem.scaleDate,
    createdAt,
    itemType,
  });
  if (scaleItem.scaleId) timeItem.itemSubTypes = [scaleItem.scaleId];

  const append = planAppend(() => participant.timeItems!, timeItem);
  if (existing && !removePriorValues) {
    if (pending) pending.push(timeItem);
    else appends?.set(existing, [timeItem]);
    return { valueChanged, commit: append };
  }

  const retained = existing && removePriorValues ? existing.filter((item) => item.itemType !== itemType) : undefined;
  return {
    valueChanged,
    commit() {
      if (!existing) participant.timeItems = [];
      // An initializing setter can supply its own items. Preserve the legacy
      // filter, assignment, then push on the array that the setter installed.
      if (removePriorValues) {
        participant.timeItems = retained ?? participant.timeItems!.filter((item) => item.itemType !== itemType);
      }
      append();
    },
  };
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
      // naming the tournament announces the event's new timeItem with MODIFY_EVENT
      addEventTimeItem({ tournamentRecord, event, timeItem });
    }
  } else {
    addTournamentTimeItem({ tournamentRecord, timeItem });
  }
}
