import { convertTime, extractDate, extractTime, formatDate, getIsoDateString, validTimeValue } from '@Tools/dateTime';
import { setMatchUpHomeParticipantId } from '@Mutate/matchUps/schedule/scheduleItems/setMatchUpHomeParticipantId';
import { addMatchUpScheduledTime, addMatchUpTimeModifiers } from '@Mutate/matchUps/schedule/scheduledTime';
import { addMatchUpScheduledDate } from '@Mutate/matchUps/schedule/scheduleItems/addMatchUpScheduledDate';
import { allocateTeamMatchUpCourts } from '@Mutate/matchUps/schedule/allocateTeamMatchUpCourts';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { assignMatchUpCourt } from '@Mutate/matchUps/schedule/assignMatchUpCourt';
import { assignMatchUpVenue } from '@Mutate/matchUps/schedule/assignMatchUpVenue';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { addMatchUpTimeItem } from '@Mutate/timeItems/matchUps/matchUpTimeItems';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { scheduledMatchUpDate } from '@Query/matchUp/scheduledMatchUpDate';
import { getParticipants } from '@Query/participants/getParticipants';
import { decorateResult } from '@Functions/global/decorateResult';
import { findDrawMatchUp } from '@Acquire/findDrawMatchUp';
import { findParticipant } from '@Acquire/findParticipant';
import { validTimeString } from '@Validators/regex';
import { isConvertableInteger } from '@Tools/math';
import { ensureInt } from '@Tools/ensureInt';
import { isString } from '@Tools/objects';

// constants and types
import { START_TIME, STOP_TIME, RESUME_TIME, END_TIME, COURT_ORDER, COURT_ANNOTATION } from '@Constants/timeItemConstants';
import { DrawDefinition, Event, TimeItem } from '@Types/tournamentTypes';
import { OBJECT, OF_TYPE } from '@Constants/attributeConstants';
import { AddScheduleAttributeArgs } from '@Types/factoryTypes';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { OFFICIAL } from '@Constants/participantRoles';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  SCHEDULE_CONFLICT_DOUBLE_BOOKING,
  MISSING_MATCHUP_ID,
  INVALID_RESUME_TIME,
  INVALID_START_TIME,
  EXISTING_END_TIME,
  INVALID_STOP_TIME,
  INVALID_END_TIME,
  INVALID_TIME,
  ANACHRONISM,
  INVALID_VALUES,
  ErrorType,
  MISSING_PARTICIPANT_ID,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

function timeDate(value, scheduledDate) {
  const time = validTimeString.test(value) ? value : extractTime(value);
  const date = extractDate(value) || extractDate(scheduledDate) || formatDate(new Date());

  // doesn't matter if this is invalid due to undefined time because this is used for sorting only
  return new Date(`${date}T${time}`).getTime();
}

type AddMatchUpScheduleItemsArgs = {
  inContextMatchUps?: HydratedMatchUp[];
  drawMatchUps?: HydratedMatchUp[];
  proConflictDetection?: boolean;
  drawDefinition: DrawDefinition;
  errorOnAnachronism?: boolean;
  removePriorValues?: boolean;
  checkChronology?: boolean;
  matchUpDependencies?: any;
  disableNotice?: boolean;
  tournamentRecords: any;
  tournamentRecord: any;
  matchUpId: string;
  schedule: any;
  event?: Event;
};

export function addMatchUpScheduleItems(params: AddMatchUpScheduleItemsArgs): {
  error?: ErrorType;
  success?: boolean;
  warnings?: any[];
  info?: any;
} {
  const stack = 'addMatchUpScheduleItems';

  const paramsCheck = checkRequiredParameters(
    params,
    [
      { drawDefinition: true, matchUpId: true },
      { schedule: true, [OF_TYPE]: OBJECT },
    ],
    stack,
  );
  if (paramsCheck.error) return paramsCheck;

  let { matchUpDependencies, inContextMatchUps } = params;
  const {
    proConflictDetection = false,
    errorOnAnachronism = false,
    checkChronology = true,
    removePriorValues,
    tournamentRecords,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    drawMatchUps,
    matchUpId,
    schedule,
    event,
  } = params;
  let matchUp, warning;

  if (drawMatchUps) {
    matchUp = drawMatchUps.find((drawMatchUp) => drawMatchUp.matchUpId === matchUpId);
  } else {
    const result = findDrawMatchUp({ drawDefinition, event, matchUpId });
    if (result.error) return result;
    matchUp = result.matchUp;
  }

  const {
    endTime,
    courtId,
    courtIds,
    courtAnnotation,
    courtOrder,
    resumeTime,
    homeParticipantId,
    scheduledDate,
    scheduledTime,
    startTime,
    stopTime,
    timeModifiers,
    venueId,
  } = schedule;

  if (checkChronology && (!matchUpDependencies || !inContextMatchUps)) {
    ({ matchUpDependencies, matchUps: inContextMatchUps } = getMatchUpDependencies({
      drawDefinition,
    }));
  }

  const priorMatchUpIds = matchUpDependencies?.[matchUpId]?.matchUpIds;
  if (schedule.scheduledDate && checkChronology && priorMatchUpIds) {
    const priorMatchUpTimes = inContextMatchUps
      ?.filter(
        (matchUp) =>
          (matchUp.schedule?.scheduledDate || extractDate(matchUp.schedule?.scheduledTime)) &&
          priorMatchUpIds.includes(matchUp.matchUpId),
      )
      .map(({ schedule }) => {
        const isoDateString = getIsoDateString(schedule);
        return new Date(isoDateString ?? '').getTime();
      });

    if (priorMatchUpTimes?.length) {
      const isoDateString = getIsoDateString(schedule);
      const matchUpTime = new Date(isoDateString ?? '').getTime();
      const maxPriorMatchUpTime = Math.max(...priorMatchUpTimes);
      if (maxPriorMatchUpTime >= matchUpTime) {
        if (errorOnAnachronism) {
          return decorateResult({ result: { error: ANACHRONISM }, stack });
        } else {
          warning = ANACHRONISM;
        }
      }
    }
  }

  if (scheduledDate !== undefined) {
    const result = addMatchUpScheduledDate({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      scheduledDate,
      matchUpId,
    });
    if (result?.error) return decorateResult({ result, stack, context: { scheduledDate } });
  }
  if (scheduledTime !== undefined) {
    const result = addMatchUpScheduledTime({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      scheduledTime,
      matchUpId,
      matchUp,
    });
    if (result?.error) return decorateResult({ result, stack, context: { scheduledTime } });
  }
  if (startTime !== undefined) {
    const result = addMatchUpStartTime({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      startTime,
      event,
    });
    if (result?.error) return decorateResult({ result, stack, context: { startTime } });
  }
  if (stopTime !== undefined) {
    const result = addMatchUpStopTime({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      stopTime,
      event,
    });
    if (result?.error) return decorateResult({ result, stack, context: { stopTime } });
  }
  if (resumeTime !== undefined) {
    const result = addMatchUpResumeTime({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      resumeTime,
      matchUpId,
      event,
    });
    if (result?.error) return decorateResult({ result, stack, context: { resumeTime } });
  }
  if (endTime !== undefined) {
    const result = addMatchUpEndTime({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      endTime,
      event,
    });
    if (result?.error) return decorateResult({ result, stack, context: { endTime } });
  }
  if (courtIds !== undefined) {
    const result = allocateTeamMatchUpCourts({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      courtIds,
    });
    if (result?.error) return decorateResult({ result, stack, context: { courtIds } });
  }

  // Check for schedule conflict before assigning court
  if (
    proConflictDetection &&
    courtId !== undefined &&
    scheduledDate !== undefined &&
    courtOrder !== undefined &&
    isConvertableInteger(courtOrder)
  ) {
    const targetCourtOrder = ensureInt(courtOrder);
    const allMatchUps = allTournamentMatchUps({ tournamentRecord })?.matchUps ?? [];

    // Check if any other matchUp already occupies this court slot
    const conflictingMatchUp = allMatchUps.find((m) => {
      if (m.matchUpId === matchUpId) return false; // Skip current matchUp
      const matchUpCourtOrder = m.schedule?.courtOrder ? ensureInt(m.schedule.courtOrder) : undefined;
      return (
        m.schedule?.courtId === courtId &&
        matchUpCourtOrder === targetCourtOrder &&
        m.schedule?.scheduledDate === scheduledDate
      );
    });

    if (conflictingMatchUp) {
      return decorateResult({
        result: {
          error: SCHEDULE_CONFLICT_DOUBLE_BOOKING,
          info: `Court slot already occupied by matchUp ${conflictingMatchUp.matchUpId}`,
        },
        stack,
        context: { courtId, courtOrder, scheduledDate },
      });
    }
  }

  if (courtId !== undefined && scheduledDate !== undefined) {
    const result = assignMatchUpCourt({
      courtDayDate: scheduledDate,
      disableNotice: true,
      removePriorValues,
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      courtId,
    });
    if (result?.error) return decorateResult({ result, stack, context: { courtId } });
  }

  if (venueId !== undefined) {
    const result = assignMatchUpVenue({
      disableNotice: true,
      removePriorValues,
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      venueId,
    });
    if (result?.error) return decorateResult({ result, stack, context: { venueId } });
  }

  if (courtOrder !== undefined && isConvertableInteger(courtOrder)) {
    const result = addMatchUpCourtOrder({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      courtOrder,
      matchUpId,
    });
    if (result?.error) return decorateResult({ result, stack, context: { courtOrder } });
  }

  if (courtAnnotation !== undefined) {
    const result = addMatchUpCourtAnnotation({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      courtAnnotation,
      matchUpId,
    });
    if (result?.error) return decorateResult({ result, stack, context: { courtAnnotation } });
  }

  if (timeModifiers !== undefined) {
    const result = addMatchUpTimeModifiers({
      disableNotice: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      timeModifiers,
      matchUpId,
      matchUp,
    });
    if (result?.error) return decorateResult({ result, stack, context: { timeModifiers } });
  }

  if (isString(homeParticipantId)) {
    setMatchUpHomeParticipantId({
      disableNotice: true,
      homeParticipantId,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      matchUpId,
    });
  }

  if (!disableNotice) {
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: event?.eventId,
      context: stack,
      drawDefinition,
      matchUp,
    });
  }

  return warning ? { ...SUCCESS, warnings: [warning] } : { ...SUCCESS };
}

export function addMatchUpCourtOrder({
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  courtOrder,
  matchUpId,
}: AddScheduleAttributeArgs & { courtOrder?: number }) {
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };

  if (courtOrder && !isConvertableInteger(courtOrder))
    return { error: INVALID_VALUES, info: 'courtOrder must be numeric' };

  const itemValue = courtOrder && ensureInt(courtOrder);
  const timeItem = {
    itemType: COURT_ORDER,
    itemValue,
  };

  return addMatchUpTimeItem({
    duplicateValues: false,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
    timeItem,
  });
}

export function addMatchUpCourtAnnotation({
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  courtAnnotation,
  disableNotice,
  matchUpId,
}: AddScheduleAttributeArgs & { courtAnnotation?: string }) {
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };

  // undefined or empty string clears the annotation
  const itemValue = courtAnnotation || undefined;
  const timeItem = {
    itemType: COURT_ANNOTATION,
    itemValue,
  };

  return addMatchUpTimeItem({
    duplicateValues: false,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
    timeItem,
  });
}

export function addMatchUpOfficial({
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  participantId,
  officialType,
  matchUpId,
}: AddScheduleAttributeArgs & {
  participantId?: string;
  officialType?: string;
}) {
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };

  if (!participantId) return { error: MISSING_PARTICIPANT_ID };

  if (tournamentRecord) {
    const tournamentParticipants =
      getParticipants({
        tournamentRecord,
        participantFilters: {
          participantTypes: [INDIVIDUAL],
          participantRoles: [OFFICIAL],
        },
      }).participants ?? [];

    const participant = findParticipant({
      tournamentParticipants,
      participantId,
    });

    if (!participant) return { error: PARTICIPANT_NOT_FOUND };
  }

  const timeItem: TimeItem = {
    itemType: 'SCHEDULE.ASSIGNMENT.OFFICIAL',
    itemValue: participantId,
  };
  if (officialType) timeItem.itemSubTypes = [officialType];

  return addMatchUpTimeItem({
    duplicateValues: false,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
    timeItem,
  });
}

export function addMatchUpStartTime({
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  matchUpId,
  startTime,
  event,
}: AddScheduleAttributeArgs & { startTime?: string }) {
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };
  if (!validTimeValue(startTime)) return { error: INVALID_TIME };

  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  const { scheduledDate } = scheduledMatchUpDate({ matchUp });
  const timeItems = matchUp?.timeItems ?? [];

  const earliestRelevantTimeValue = timeItems
    .filter((timeItem: any) => [STOP_TIME, RESUME_TIME, END_TIME].includes(timeItem?.itemType))
    .map((timeItem) => timeDate(timeItem.itemValue, scheduledDate))
    .reduce((earliest: any, timeValue) => (!earliest || timeValue < earliest ? timeValue : earliest), undefined);

  // START_TIME must be prior to any STOP_TIMEs, RESUME_TIMEs and STOP_TIME
  if (!earliestRelevantTimeValue || timeDate(startTime, scheduledDate) < earliestRelevantTimeValue) {
    // there can be only one START_TIME; if a prior START_TIME exists, remove it
    if (matchUp?.timeItems) {
      matchUp.timeItems = matchUp.timeItems.filter((timeItem) => timeItem.itemType !== START_TIME);
    }

    const militaryTime = convertTime(startTime, true, true);
    const timeItem = { itemType: START_TIME, itemValue: militaryTime };

    return addMatchUpTimeItem({
      duplicateValues: false,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      disableNotice,
      matchUpId,
      timeItem,
    });
  } else {
    return { error: INVALID_START_TIME };
  }
}

export function addMatchUpEndTime({
  validateTimeSeries = true,
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  matchUpId,
  endTime,
  event,
}: AddScheduleAttributeArgs & {
  validateTimeSeries?: boolean;
  endTime?: string;
}) {
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };
  if (!validTimeValue(endTime)) return { error: INVALID_TIME };

  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  const { scheduledDate } = scheduledMatchUpDate({ matchUp });
  const timeItems = matchUp?.timeItems ?? [];

  const latestRelevantTimeValue = timeItems
    .filter((timeItem: any) => [START_TIME, RESUME_TIME, STOP_TIME].includes(timeItem?.itemType))
    .map((timeItem) => timeDate(timeItem.itemValue, scheduledDate))
    .reduce((latest: any, timeValue) => (!latest || timeValue > latest ? timeValue : latest), undefined);

  // END_TIME must be after any START_TIMEs, STOP_TIMEs, RESUME_TIMEs
  if (!validateTimeSeries || !latestRelevantTimeValue || timeDate(endTime, scheduledDate) > latestRelevantTimeValue) {
    // there can be only one END_TIME; if a prior END_TIME exists, remove it
    if (matchUp?.timeItems) {
      matchUp.timeItems = matchUp.timeItems.filter((timeItem) => timeItem.itemType !== END_TIME);
    }

    // All times stored as military time
    const militaryTime = convertTime(endTime, true, true);
    const timeItem = { itemType: END_TIME, itemValue: militaryTime };

    return addMatchUpTimeItem({
      duplicateValues: false,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      disableNotice,
      matchUpId,
      timeItem,
    });
  } else {
    return { error: INVALID_END_TIME };
  }
}

export function addMatchUpStopTime({
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  matchUpId,
  stopTime,
  event,
}: AddScheduleAttributeArgs & {
  stopTime?: string;
}) {
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };
  if (!validTimeValue(stopTime)) return { error: INVALID_TIME };

  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  const { scheduledDate } = scheduledMatchUpDate({ matchUp });
  const timeItems = matchUp?.timeItems ?? [];

  // can't add a STOP_TIME if the matchUp is not STARTED or RESUMED, or has START_TIME
  // if latest relevaant timeItem is a STOP_TIME then overwrite

  const hasEndTime = timeItems.reduce((hasEndTime: any, timeItem) => {
    return timeItem.itemType === END_TIME || hasEndTime;
  }, undefined);

  if (hasEndTime) return { error: EXISTING_END_TIME };

  const relevantTimeItems = timeItems
    .filter((timeItem: any) => [START_TIME, RESUME_TIME, STOP_TIME].includes(timeItem?.itemType))
    .sort((a, b) => timeDate(a.itemValue, scheduledDate) - timeDate(b.itemValue, scheduledDate));

  const lastRelevantTimeItem = relevantTimeItems.at(-1);
  const lastRelevantTimeItemIsStop = lastRelevantTimeItem?.itemType === STOP_TIME;

  const latestRelevantTimeValue = relevantTimeItems
    .filter((timeItem) => !lastRelevantTimeItemIsStop || timeItem.createdAt !== lastRelevantTimeItem.createdAt)
    .map((timeItem) => timeDate(timeItem.itemValue, scheduledDate))
    .reduce((latest: any, timeValue) => (!latest || timeValue > latest ? timeValue : latest), undefined);

  if (timeDate(stopTime, scheduledDate) > latestRelevantTimeValue) {
    if (matchUp?.timeItems && lastRelevantTimeItemIsStop) {
      const targetTimeStamp = lastRelevantTimeItem.createdAt;
      matchUp.timeItems = matchUp.timeItems.filter((timeItem) => timeItem.createdAt !== targetTimeStamp);
    }

    // All times stored as military time
    const militaryTime = convertTime(stopTime, true, true);
    const timeItem = {
      itemValue: militaryTime,
      itemType: STOP_TIME,
    };

    return addMatchUpTimeItem({
      duplicateValues: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      disableNotice,
      matchUpId,
      timeItem,
    });
  } else {
    return { error: INVALID_STOP_TIME };
  }
}

export function addMatchUpResumeTime({
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  resumeTime,
  matchUpId,
  event,
}: AddScheduleAttributeArgs & {
  resumeTime?: string;
}) {
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };
  if (!validTimeValue(resumeTime)) return { error: INVALID_TIME };

  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  const { scheduledDate } = scheduledMatchUpDate({ matchUp });
  const timeItems = matchUp?.timeItems ?? [];

  // can't add a RESUME_TIME if the matchUp is not STOPPED, or if it has ENDED
  // if latest relevaant timeItem is a RESUME_TIME then overwrite

  const hasEndTime = timeItems.reduce((hasEndTime: any, timeItem) => {
    return timeItem.itemType === END_TIME || hasEndTime;
  }, undefined);

  if (hasEndTime) return { error: EXISTING_END_TIME };

  const relevantTimeItems = timeItems
    .filter((timeItem: any) => [START_TIME, RESUME_TIME, STOP_TIME].includes(timeItem?.itemType))
    .sort((a, b) => timeDate(a.itemValue, scheduledDate) - timeDate(b.itemValue, scheduledDate));

  const lastRelevantTimeItem = relevantTimeItems.at(-1);
  const lastRelevantTimeItemIsResume = lastRelevantTimeItem?.itemType === RESUME_TIME;

  const latestRelevantTimeValue = relevantTimeItems
    .filter((timeItem) => !lastRelevantTimeItemIsResume || timeItem.createdAt !== lastRelevantTimeItem.createdAt)
    .map((timeItem) => timeDate(timeItem.itemValue, scheduledDate))
    .reduce((latest: any, timeValue) => (!latest || timeValue > latest ? timeValue : latest), undefined);

  if (timeDate(resumeTime, scheduledDate) > latestRelevantTimeValue) {
    if (matchUp?.timeItems && lastRelevantTimeItemIsResume) {
      const targetTimeStamp = lastRelevantTimeItem.createdAt;
      matchUp.timeItems = matchUp.timeItems.filter((timeItem) => timeItem.createdAt !== targetTimeStamp);
    }

    // All times stored as military time
    const militaryTime = convertTime(resumeTime, true, true);
    const timeItem = {
      itemValue: militaryTime,
      itemType: RESUME_TIME,
    };

    return addMatchUpTimeItem({
      duplicateValues: true,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      disableNotice,
      matchUpId,
      timeItem,
    });
  } else {
    return { error: INVALID_RESUME_TIME };
  }
}
