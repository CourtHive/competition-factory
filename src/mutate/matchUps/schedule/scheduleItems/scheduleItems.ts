import {
  convertTime,
  dateStringDaysChange,
  extractDate,
  extractTime,
  formatDate,
  getIsoDateString,
  validTimeValue,
} from '@Tools/dateTime';
import { getMatchUpOfficialConflicts } from '@Query/officiating/getMatchUpOfficialConflicts';
import { scheduleLockConflicts } from '@Query/matchUp/isScheduleLocked';
import { setMatchUpHomeParticipantId } from '@Mutate/matchUps/schedule/scheduleItems/setMatchUpHomeParticipantId';
import { setMatchUpFirstClassOrTimeItem } from '@Mutate/timeItems/matchUps/setMatchUpFirstClassOrTimeItem';
import { addMatchUpScheduledTime, addMatchUpTimeModifiers } from '@Mutate/matchUps/schedule/scheduledTime';
import { addMatchUpScheduledDate } from '@Mutate/matchUps/schedule/scheduleItems/addMatchUpScheduledDate';
import { allocateTeamMatchUpCourts } from '@Mutate/matchUps/schedule/allocateTeamMatchUpCourts';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { assignMatchUpCourt } from '@Mutate/matchUps/schedule/assignMatchUpCourt';
import { assignMatchUpVenue } from '@Mutate/matchUps/schedule/assignMatchUpVenue';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { addMatchUpTimeItem } from '@Mutate/timeItems/matchUps/matchUpTimeItems';
import { getMatchUpDependencies } from '@Query/matchUps/getMatchUpDependencies';
import { setMatchUpCalledAt } from '@Mutate/matchUps/schedule/setMatchUpCalledAt';
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
import {
  START_TIME,
  STOP_TIME,
  RESUME_TIME,
  END_TIME,
  END_DATE,
  COURT_ORDER,
  COURT_ANNOTATION,
} from '@Constants/timeItemConstants';
import { DrawDefinition, Event } from '@Types/tournamentTypes';
import { OBJECT, OF_TYPE } from '@Constants/attributeConstants';
import { AddScheduleAttributeArgs } from '@Types/factoryTypes';
import { INDIVIDUAL } from '@Constants/participantConstants';
import { OFFICIAL_CONFLICT_OF_INTEREST } from '@Constants/officiatingConstants';
import { POLICY_TYPE_OFFICIATING_CONFLICT } from '@Constants/policyConstants';
import { OFFICIAL } from '@Constants/participantRoles';
import { SUCCESS } from '@Constants/resultConstants';
import type { OfficialRecord } from '@Types/officiatingTypes';
import { HydratedMatchUp } from '@Types/hydrated';
import {
  SCHEDULE_CONFLICT_DOUBLE_BOOKING,
  SCHEDULE_LOCKED,
  MISSING_MATCHUP_ID,
  INVALID_RESUME_TIME,
  INVALID_START_TIME,
  EXISTING_END_TIME,
  INVALID_STOP_TIME,
  INVALID_END_TIME,
  INVALID_TIME,
  ANACHRONISM,
  UNWRITABLE_SCHEDULE_ATTRIBUTES,
  INVALID_VALUES,
  ErrorType,
  MISSING_TOURNAMENT_RECORD,
  MISSING_PARTICIPANT_ID,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

/**
 * Court identities from an `allocatedCourts` value, in the bare-string form the
 * allocation mutation expects. Accepts what a matchUp reads back — hydrated
 * court objects — as well as plain ids, so read → write round-trips.
 *
 * Returns `undefined` for a non-array (nothing to alias) and passes an empty
 * array through unchanged, so `allocatedCourts: []` behaves exactly as
 * `courtIds: []` does rather than acquiring new semantics here.
 */
function allocatedCourtIds(value: any): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.map((entry) => (typeof entry === 'string' ? entry : entry?.courtId)).filter(Boolean);
}

function timeDate(value, scheduledDate) {
  const time = validTimeString.test(value) ? value : extractTime(value);
  const date = extractDate(value) || extractDate(scheduledDate) || formatDate(new Date());

  // doesn't matter if this is invalid due to undefined time because this is used for sorting only
  return new Date(`${date}T${time}`).getTime();
}

function applyScheduleTiming({
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  scheduledDate,
  scheduledTime,
  startTime,
  stopTime,
  resumeTime,
  endTime,
  calledAt,
  matchUpId,
  matchUp,
  event,
  stack,
}) {
  // `calledAt` is an actual-play attribute and belongs with the four below it,
  // not with placement: the schedule lock deliberately does not guard any of
  // them, so a pinned matchUp can still be called, started, suspended and
  // completed.
  //
  // The guard is `!== undefined`, matching every sibling, and that is a
  // DELIBERATE narrowing of `setMatchUpCalledAt`'s own contract. Called
  // directly, that method reads `undefined` as "clear". Here an absent key
  // destructures to `undefined` too, so honouring that reading would make every
  // partial schedule write silently wipe a call-to-court. `null` remains the
  // explicit clear, which is what a caller round-tripping a schedule object
  // would send anyway.
  if (calledAt !== undefined) {
    const result = setMatchUpCalledAt({
      disableNotice: true,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      calledAt,
      event,
    });
    if (result?.error) return decorateResult({ result, stack, context: { calledAt } });
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
  return undefined;
}

function applyScheduleAssignments({
  proConflictDetection,
  removePriorValues,
  tournamentRecords,
  tournamentRecord,
  drawDefinition,
  homeParticipantId,
  timeModifiers,
  courtAnnotation,
  scheduledDate,
  courtOrder,
  courtIds,
  courtId,
  venueId,
  matchUpId,
  matchUp,
  stack,
}) {
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

  const conflictResult = checkScheduleConflicts({
    proConflictDetection,
    tournamentRecord,
    scheduledDate,
    courtOrder,
    matchUpId,
    courtId,
    stack,
  });
  if (conflictResult) return conflictResult;

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

  if (courtOrder !== undefined) {
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

  return undefined;
}

// courtOrder/courtId/venueId describe a position on ONE day's schedule grid.
// When a matchUp is re-dated they no longer apply and are cleared so the match
// does not inherit the prior day's row on the new day.
function unassignGridPosition({ tournamentRecords, tournamentRecord, drawDefinition, matchUpId, courtDayDate }) {
  const shared = { removePriorValues: true, disableNotice: true, tournamentRecord, drawDefinition, matchUpId };
  addMatchUpCourtOrder({ ...shared, courtOrder: undefined });
  assignMatchUpCourt({ ...shared, tournamentRecords, courtDayDate, courtId: '' });
  assignMatchUpVenue({ ...shared, tournamentRecords, venueId: undefined });
}

/**
 * Every attribute this facade actually writes.
 *
 * Kept as an explicit set rather than derived from the destructure so that
 * adding a key to one and forgetting the other is a test failure rather than a
 * silent no-op — which is the exact defect this guard exists to close.
 */
const WRITABLE_SCHEDULE_ATTRIBUTES = new Set([
  'allocatedCourts',
  'calledAt',
  'courtAnnotation',
  'courtId',
  'courtIds',
  'courtOrder',
  'endTime',
  'homeParticipantId',
  'resumeTime',
  'scheduledDate',
  'scheduledTime',
  'startTime',
  'stopTime',
  'timeModifiers',
  'venueId',
]);

/**
 * Hydrator output that a caller can only ever be echoing back, never setting.
 *
 * Reading a matchUp's schedule and writing it back is a supported pattern — it
 * is what the `courtIds` / `allocatedCourts` accommodation above exists to
 * protect — and a hydrated schedule carries fourteen keys this facade does not
 * write. Warning about these would make every round-trip noisy for values the
 * caller had no way to omit and no ability to influence, so they are dropped in
 * silence, deliberately.
 */
const DERIVED_SCHEDULE_ATTRIBUTES = new Set([
  'averageMinutes',
  'courtName',
  'endDate',
  'isoDateString',
  'milliseconds',
  'recoveryMinutes',
  'time',
  'timeAfterRecovery',
  'typeChangeRecoveryMinutes',
  'typeChangeTimeAfterRecovery',
  'venueAbbreviation',
  'venueName',
]);

/**
 * Attributes this facade ignores, reported rather than dropped in silence.
 *
 * The dangerous class is NOT the typo — it is the **real attribute this function
 * does not happen to write**. `calledAt` was one: hydrated, storable, accepted
 * without complaint and never written, so a caller got `{ success: true }` and
 * no call-to-court. `allocatedCourts` was another, fixed in place above. A guard
 * that only caught unrecognised names would have caught neither, because both
 * are names the hydrator emits.
 *
 * So anything neither written nor purely derived is named back to the caller —
 * `lock` most of all, since silently discarding a director's pin is the worst of
 * these to discover later. Warnings, not errors, because callers in the field
 * round-trip locked and scored matchUps today and breaking them to make a point
 * about hygiene would be the wrong trade; `errorOnUnknownAttributes` escalates
 * per call, mirroring how `errorOnAnachronism` escalates ANACHRONISM.
 */
function unwritableScheduleAttributes(schedule: any): string[] {
  return Object.keys(schedule ?? {}).filter(
    (key) =>
      schedule[key] !== undefined && !WRITABLE_SCHEDULE_ATTRIBUTES.has(key) && !DERIVED_SCHEDULE_ATTRIBUTES.has(key),
  );
}

/** The unwritable attributes, plus the error to return if this caller asked to be stopped by them. */
function checkUnwritableAttributes(schedule: any, errorOnUnknownAttributes: boolean, stack: string) {
  const unwritable = unwritableScheduleAttributes(schedule);
  if (!unwritable.length || !errorOnUnknownAttributes) return { unwritable };
  return {
    unwritable,
    error: decorateResult({
      result: { error: UNWRITABLE_SCHEDULE_ATTRIBUTES },
      info: `not written: ${unwritable.join(', ')}`,
      stack,
    }),
  };
}

/** Success, carrying whatever the call has to say for itself. */
function scheduleItemsResult(warning: any, unwritable: string[]) {
  const warnings = [
    ...(warning ? [warning] : []),
    ...(unwritable.length ? [{ ...UNWRITABLE_SCHEDULE_ATTRIBUTES, attributes: unwritable }] : []),
  ];
  return warnings.length ? { ...SUCCESS, warnings } : { ...SUCCESS };
}

type AddMatchUpScheduleItemsArgs = {
  inContextMatchUps?: HydratedMatchUp[];
  drawMatchUps?: HydratedMatchUp[];
  overrideScheduleLock?: boolean;
  proConflictDetection?: boolean;
  drawDefinition: DrawDefinition;
  errorOnUnknownAttributes?: boolean;
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
    errorOnUnknownAttributes = false,
    proConflictDetection = false,
    errorOnAnachronism = false,
    checkChronology = true,
    overrideScheduleLock,
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

  // A director's schedule lock pins PLACEMENT. Actual-play attributes
  // (startTime / stopTime / resumeTime / endTime) are never guarded, so a
  // locked matchUp can still be started, suspended and completed. Callers that
  // have confirmed the move with the operator pass `overrideScheduleLock`.
  if (!overrideScheduleLock) {
    const lockedAttributes = scheduleLockConflicts({ matchUp, schedule });
    if (lockedAttributes.length) {
      return decorateResult({
        info: `schedule locked: ${lockedAttributes.join(', ')}`,
        result: { error: SCHEDULE_LOCKED },
        stack,
      });
    }
  }

  // Reported before anything is written, so a caller learns what will be ignored
  // even when a later step errors out.
  const { unwritable, error: unwritableError } = checkUnwritableAttributes(schedule, errorOnUnknownAttributes, stack);
  if (unwritableError) return unwritableError;

  const {
    endTime,
    calledAt,
    courtId,
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

  // `courtIds` is the write spelling; `allocatedCourts` is what a matchUp READS
  // back (`[{ courtId, venueId }]`, hydrated with court/venue names). Accept
  // both so a schedule object round-trips: reading a matchUp's schedule and
  // writing it back used to drop a TEAM court allocation silently, because this
  // function destructured only `courtIds` and ignored the other key entirely.
  // An explicit `courtIds` wins when a caller supplies both.
  const courtIds = schedule.courtIds ?? allocatedCourtIds(schedule.allocatedCourts);

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

  // Detect a day change BEFORE applyScheduleTiming mutates the matchUp's date.
  // When the date moves and the caller supplies no explicit grid position, the
  // prior day's courtOrder/court/venue are stale and get cleared below.
  const priorScheduledDate = scheduledMatchUpDate({ matchUp })?.scheduledDate;
  const nextScheduledDate = scheduledDate !== undefined ? extractDate(scheduledDate) : undefined;
  const clearGridPositionOnDateChange =
    !!nextScheduledDate &&
    !!priorScheduledDate &&
    extractDate(priorScheduledDate) !== nextScheduledDate &&
    courtOrder === undefined &&
    courtId === undefined &&
    venueId === undefined;

  const timingResult = applyScheduleTiming({
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    scheduledDate,
    scheduledTime,
    startTime,
    stopTime,
    resumeTime,
    endTime,
    calledAt,
    matchUpId,
    matchUp,
    event,
    stack,
  });
  if (timingResult?.error) return timingResult;

  const assignmentResult = applyScheduleAssignments({
    proConflictDetection,
    removePriorValues,
    tournamentRecords,
    tournamentRecord,
    drawDefinition,
    homeParticipantId,
    timeModifiers,
    courtAnnotation,
    scheduledDate,
    courtOrder,
    courtIds,
    courtId,
    venueId,
    matchUpId,
    matchUp,
    stack,
  });
  if (assignmentResult?.error) return assignmentResult;

  if (clearGridPositionOnDateChange) {
    unassignGridPosition({
      tournamentRecords,
      tournamentRecord,
      drawDefinition,
      matchUpId,
      courtDayDate: nextScheduledDate,
    });
  }

  if (!disableNotice) {
    modifyMatchUpNotice({
      tournamentId: tournamentRecord?.tournamentId,
      eventId: event?.eventId,
      context: stack,
      drawDefinition,
      matchUp,
      event,
    });
  }

  return scheduleItemsResult(warning, unwritable);
}

function checkScheduleConflicts({
  proConflictDetection,
  tournamentRecord,
  scheduledDate,
  courtOrder,
  matchUpId,
  courtId,
  stack,
}: {
  proConflictDetection: boolean;
  tournamentRecord: any;
  scheduledDate?: string;
  courtOrder?: number;
  matchUpId: string;
  courtId?: string;
  stack: string;
}) {
  if (
    !proConflictDetection ||
    courtId === undefined ||
    scheduledDate === undefined ||
    courtOrder === undefined ||
    !isConvertableInteger(courtOrder)
  ) {
    return undefined;
  }

  const targetCourtOrder = ensureInt(courtOrder);
  const allMatchUps = allTournamentMatchUps({ tournamentRecord })?.matchUps ?? [];

  const conflictingMatchUp = allMatchUps.find((m) => {
    if (m.matchUpId === matchUpId) return false;
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

  return undefined;
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

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'courtOrder',
    itemType: COURT_ORDER,
    value: itemValue,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
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

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'courtAnnotation',
    itemType: COURT_ANNOTATION,
    value: itemValue,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
  });
}

export function addMatchUpOfficial({
  removePriorValues,
  policyDefinitions,
  tournamentRecord,
  organisationIds,
  nationalityCode,
  drawDefinition,
  officialRecord,
  disableNotice,
  participantId,
  officialType,
  matchUpId,
  event,
}: AddScheduleAttributeArgs & {
  policyDefinitions?: { [key: string]: any };
  officialRecord?: OfficialRecord;
  organisationIds?: string[];
  nationalityCode?: string;
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

  // Conflict-of-interest gate — opt-in, and scoped to THIS matchUp's sides rather than the whole
  // field. An `officialRecord` is NOT required: the official's own participantId is a sufficient
  // declaration source via tournament GROUP membership, so the gate works with nothing but the
  // tournamentRecord. A registry record, when supplied, adds durable cross-tournament declarations.
  if (policyDefinitions?.[POLICY_TYPE_OFFICIATING_CONFLICT]) {
    if (!tournamentRecord) return { error: MISSING_TOURNAMENT_RECORD };

    const conflictResult = getMatchUpOfficialConflicts({
      // The official being assigned IS the subject of the check — their participantId unlocks the
      // tournament-scoped SHARED_GROUPING rule with no registry record required.
      officialParticipantId: participantId,
      policyDefinitions,
      tournamentRecord,
      organisationIds,
      nationalityCode,
      drawDefinition,
      officialRecord,
      matchUpId,
      event,
    });
    if (conflictResult.error) return { error: conflictResult.error };
    if (conflictResult.blocked) {
      return { error: OFFICIAL_CONFLICT_OF_INTEREST, conflicts: conflictResult.conflicts };
    }

    const result: any = setMatchUpFirstClassOrTimeItem({
      duplicateValues: false,
      attribute: 'official',
      itemType: 'SCHEDULE.ASSIGNMENT.OFFICIAL',
      itemSubTypes: officialType ? [officialType] : undefined,
      value: participantId,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      disableNotice,
      matchUpId,
    });

    // Non-blocking (WARN) conflicts ride back with the successful assignment.
    return conflictResult.conflicts?.length ? { ...result, conflicts: conflictResult.conflicts } : result;
  }

  return setMatchUpFirstClassOrTimeItem({
    duplicateValues: false,
    attribute: 'official',
    itemType: 'SCHEDULE.ASSIGNMENT.OFFICIAL',
    itemSubTypes: officialType ? [officialType] : undefined,
    value: participantId,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
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

// Sanity cap for rolling an after-midnight END_TIME onto the next calendar day.
// A same-day end that sorts before the latest START/STOP/RESUME is treated as
// crossing midnight only if the rolled interval is within this span; beyond it,
// the value is rejected as a genuine "end before start" error.
const MAX_CROSS_MIDNIGHT_SPAN_MS = 12 * 60 * 60 * 1000;

function resolveEndTimePlacement({
  latestRelevantTimeValue,
  validateTimeSeries,
  scheduledDate,
  endTime,
}: {
  latestRelevantTimeValue?: number;
  validateTimeSeries?: boolean;
  scheduledDate?: string;
  endTime?: string;
}): { acceptable: boolean; endDate?: string } {
  const sameDayEnd = timeDate(endTime, scheduledDate);
  if (!validateTimeSeries || !latestRelevantTimeValue || sameDayEnd > latestRelevantTimeValue) {
    return { acceptable: true };
  }

  // The same-day end sorts at/before the latest START/STOP/RESUME — the match ran
  // past midnight. Roll the end onto the following calendar day if the resulting
  // span is plausible; otherwise it's a genuine end-before-start error.
  if (scheduledDate) {
    const endDate = dateStringDaysChange(scheduledDate, 1);
    const rolledEnd = timeDate(endTime, endDate);
    if (rolledEnd > latestRelevantTimeValue && rolledEnd - latestRelevantTimeValue <= MAX_CROSS_MIDNIGHT_SPAN_MS) {
      return { acceptable: true, endDate };
    }
  }

  return { acceptable: false };
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

  const placement = resolveEndTimePlacement({ latestRelevantTimeValue, validateTimeSeries, scheduledDate, endTime });
  if (!placement.acceptable) return { error: INVALID_END_TIME };

  // there can be only one END_TIME / END_DATE; remove any prior values before writing
  if (matchUp?.timeItems) {
    matchUp.timeItems = matchUp.timeItems.filter(
      (timeItem) => timeItem.itemType !== END_TIME && timeItem.itemType !== END_DATE,
    );
  }

  // All times stored as military time; END_TIME stays a bare HH:MM value
  const militaryTime = convertTime(endTime, true, true);
  const endTimeResult: any = addMatchUpTimeItem({
    duplicateValues: false,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
    timeItem: { itemType: END_TIME, itemValue: militaryTime },
  });
  if (endTimeResult?.error) return endTimeResult;

  // when the match crossed midnight, record the end's calendar day (scheduledDate + 1)
  if (placement.endDate) {
    const endDateResult: any = addMatchUpTimeItem({
      duplicateValues: false,
      removePriorValues,
      tournamentRecord,
      drawDefinition,
      disableNotice,
      matchUpId,
      timeItem: { itemType: END_DATE, itemValue: placement.endDate },
    });
    if (endDateResult?.error) return endDateResult;
  }

  return endTimeResult;
}

function addChronologicalTimeItem({
  removePriorValues,
  tournamentRecord,
  drawDefinition,
  disableNotice,
  invalidError,
  matchUpId,
  itemType,
  timeValue,
  event,
}: AddScheduleAttributeArgs & {
  invalidError: ErrorType;
  timeValue?: string;
  itemType: string;
}) {
  if (!matchUpId) return { error: MISSING_MATCHUP_ID };
  if (!validTimeValue(timeValue)) return { error: INVALID_TIME };

  const { matchUp } = findDrawMatchUp({ drawDefinition, event, matchUpId });
  const { scheduledDate } = scheduledMatchUpDate({ matchUp });
  const timeItems = matchUp?.timeItems ?? [];

  const hasEndTime = timeItems.reduce((hasEndTime: any, timeItem) => {
    return timeItem.itemType === END_TIME || hasEndTime;
  }, undefined);

  if (hasEndTime) return { error: EXISTING_END_TIME };

  const relevantTimeItems = timeItems
    .filter((timeItem: any) => [START_TIME, RESUME_TIME, STOP_TIME].includes(timeItem?.itemType))
    .sort((a, b) => timeDate(a.itemValue, scheduledDate) - timeDate(b.itemValue, scheduledDate));

  const lastRelevantTimeItem = relevantTimeItems.at(-1);
  const lastRelevantTimeItemIsTarget = lastRelevantTimeItem?.itemType === itemType;

  const latestRelevantTimeValue = relevantTimeItems
    .filter((timeItem) => !lastRelevantTimeItemIsTarget || timeItem !== lastRelevantTimeItem)
    .map((timeItem) => timeDate(timeItem.itemValue, scheduledDate))
    .reduce((latest: any, timeValue) => (!latest || timeValue > latest ? timeValue : latest), undefined);

  if (timeDate(timeValue, scheduledDate) > latestRelevantTimeValue) {
    if (matchUp?.timeItems && lastRelevantTimeItemIsTarget) {
      matchUp.timeItems = matchUp.timeItems.filter((timeItem) => timeItem !== lastRelevantTimeItem);
    }

    const militaryTime = convertTime(timeValue, true, true);
    const timeItem = {
      itemValue: militaryTime,
      itemType,
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
    return { error: invalidError };
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
  return addChronologicalTimeItem({
    invalidError: INVALID_STOP_TIME,
    timeValue: stopTime,
    itemType: STOP_TIME,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
    event,
  });
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
  return addChronologicalTimeItem({
    invalidError: INVALID_RESUME_TIME,
    timeValue: resumeTime,
    itemType: RESUME_TIME,
    removePriorValues,
    tournamentRecord,
    drawDefinition,
    disableNotice,
    matchUpId,
    event,
  });
}
