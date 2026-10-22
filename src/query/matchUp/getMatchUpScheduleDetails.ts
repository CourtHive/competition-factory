import { matchUpFormatTimes, resolveTimingDetails } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { addMinutesToTimeString, extractDate, extractTime, getIsoDateString } from '@Tools/dateTime';
import { getCachedVenueData, HydrationCache } from '@Query/matchUps/hydrationCache';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { scheduledMatchUpDate } from '@Query/matchUp/scheduledMatchUpDate';
import { scheduledMatchUpTime } from '@Query/matchUp/scheduledMatchUpTime';
import { matchUpDuration } from '@Query/matchUp/matchUpDuration';
import { definedAttributes } from '@Tools/definedAttributes';
import { matchUpStartTime } from '@Query/matchUp/startTime';
import { attributeFilter } from '@Tools/attributeFilter';
import { matchUpEndTime } from '@Query/matchUp/endTime';
import { findEvent } from '@Acquire/findEvent';

// constants and types
import { Event, Tournament, EventTypeUnion, DrawDefinition } from '@Types/tournamentTypes';
import { ScheduleTiming, ScheduleVisibilityFilters } from '@Types/factoryTypes';
import { MISSING_MATCHUP } from '@Constants/errorConditionConstants';
import { HydratedMatchUp } from '@Types/hydrated';
import { TEAM } from '@Constants/eventConstants';
import {
  ALLOCATE_COURTS,
  ASSIGN_COURT,
  ASSIGN_OFFICIAL,
  ASSIGN_SCOREKEEPER,
  ASSIGN_TIMEKEEPER,
  ASSIGN_VENUE,
  COURT_ANNOTATION,
  COURT_ORDER,
  END_DATE,
  HOME_PARTICIPANT_ID,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
  TIME_MODIFIERS,
} from '@Constants/timeItemConstants';

type GetMatchUpScheduleDetailsArgs = {
  scheduleVisibilityFilters?: ScheduleVisibilityFilters;
  scheduleTiming?: ScheduleTiming;
  tournamentRecord?: Tournament;
  drawDefinition?: DrawDefinition;
  matchUpType?: EventTypeUnion;
  hydrationCache?: HydrationCache;
  afterRecoveryTimes?: boolean;
  usePublishState?: boolean;
  matchUp: HydratedMatchUp;
  matchUpFormat?: string;
  publishStatus?: any;
  event?: Event;
};
/**
 * Whether a matchUp's start is still an open question.
 *
 * A `FOLLOWED_BY` or `AFTER_REST` / `NOT_BEFORE` annotation is a promise about
 * *when this matchUp may begin*. Once that is settled the annotation is not
 * merely redundant — on a published order of play it is misinformation, telling
 * a player and a referee that a match is waiting on something that has already
 * happened.
 *
 * Two settling signals, both local to the matchUp:
 *
 *   - **Called to court.** A match that has been called IS on court; "followed
 *     by" is moot for it whatever else on that court did or did not finish.
 *   - **Any score at all.** A single game is enough, and the partial case is the
 *     one that matters: that is the state a live match sits in for an hour while
 *     the annotation goes on claiming it has not begun. A completed status
 *     settles it too, walkovers included — resolved is resolved.
 */
function startIsSettled(matchUp: HydratedMatchUp): boolean {
  if (matchUp?.schedule?.calledAt) return true;
  if (matchUp?.matchUpStatus && completedMatchUpStatuses.includes(matchUp.matchUpStatus)) return true;
  if (matchUp?.winningSide) return true;
  return !!matchUp?.score?.sets?.length;
}

export function getMatchUpScheduleDetails(params: GetMatchUpScheduleDetailsArgs) {
  let event = params.event;
  let matchUpType: any = params.matchUpType;
  const {
    scheduleVisibilityFilters,
    afterRecoveryTimes,
    tournamentRecord,
    usePublishState,
    hydrationCache,
    scheduleTiming,
    matchUpFormat,
    publishStatus,
    matchUp,
  } = params;

  if (!matchUp) return { error: MISSING_MATCHUP };

  // matchUpType is required to derive averageMatchUpMinutes and recoveryMinutes.
  /// If matchUpType is not provided or is not present on matchUp...
  // ...attempt to derive by interrogating structure, draw, and event
  if (
    afterRecoveryTimes &&
    !matchUp.matchUpType &&
    !params.matchUpType &&
    (event || tournamentRecord) &&
    matchUp.drawId
  ) {
    let drawDefinition =
      params.drawDefinition ??
      event?.drawDefinitions?.find((drawDefinition) => drawDefinition.drawId === matchUp.drawId);

    if (!drawDefinition && tournamentRecord) {
      ({ drawDefinition, event } = findEvent({
        drawId: matchUp.drawId,
        tournamentRecord,
      }));
    }

    const structure = matchUp.structureId
      ? drawDefinition?.structures?.find(({ structureId }) => structureId === matchUp.structureId)
      : undefined;

    matchUpType =
      (params.matchUpType ?? structure?.matchUpType) ||
      drawDefinition?.matchUpType ||
      (event?.eventType !== TEAM && event?.eventType);
  }

  const { milliseconds, time } = matchUpDuration({ matchUp });
  const { startTime } = matchUpStartTime({ matchUp });
  const { endTime } = matchUpEndTime({ matchUp });

  const { eventIds, drawIds } = scheduleVisibilityFilters ?? {};
  const isVisible = (!eventIds || eventIds.includes(matchUp.eventId)) && (!drawIds || drawIds.includes(matchUp.drawId));

  let schedule = isVisible
    ? buildFullSchedule({
        tournamentRecord,
        hydrationCache,
        scheduleTiming,
        afterRecoveryTimes,
        matchUpFormat,
        matchUpType,
        matchUp,
        endTime,
        startTime,
        milliseconds,
        time,
      })
    : definedAttributes({ milliseconds, startTime, endTime, time });

  // A schedule lock is an internal operations annotation — it means nothing to
  // a published or public view, and `lock.reason` is the director's own note.
  if (usePublishState && schedule?.lock) delete schedule.lock;

  const { scheduledDate } = scheduledMatchUpDate({ matchUp });
  const { scheduledTime } = scheduledMatchUpTime({ matchUp });

  if (usePublishState && publishStatus?.displaySettings?.draws) {
    const drawSettings = publishStatus.displaySettings.draws;
    const scheduleDetails = (drawSettings?.[matchUp.drawId] ?? drawSettings?.default)?.scheduleDetails;
    if (scheduleDetails) {
      const scheduleAttributes = (
        scheduleDetails.find((details) => scheduledDate && details.dates?.includes(scheduledDate)) ??
        scheduleDetails.find((details) => !details.dates?.length)
      )?.attributes;

      if (scheduleAttributes) {
        // set all attributes to true
        const template = Object.assign(
          {},
          ...Object.keys(schedule).map((key) => ({ [key]: true })),
          // overwrite with publishStatus attributes
          scheduleAttributes,
        );
        schedule = attributeFilter({
          source: schedule,
          template,
        });
      }
    }
  }

  const hasCompletedStatus = matchUp.matchUpStatus && completedMatchUpStatuses.includes(matchUp.matchUpStatus);

  const endDate =
    (hasCompletedStatus &&
      (schedule?.endDate || extractDate(endTime) || extractDate(scheduledDate) || extractDate(scheduledTime))) ||
    undefined;

  return { schedule, endDate };
}

function buildFullSchedule({
  tournamentRecord,
  hydrationCache,
  scheduleTiming,
  afterRecoveryTimes,
  matchUpFormat,
  matchUpType,
  matchUp,
  endTime,
  startTime,
  milliseconds,
  time,
}) {
  const getTimeStamp = (item) => (item.createdAt ? new Date(item.createdAt).getTime() : 0);

  const timeItemMap = new Map();
  const sortedTimeItems = matchUp.timeItems?.toSorted((a, b) => getTimeStamp(a) - getTimeStamp(b)) ?? [];
  for (const timeItem of sortedTimeItems) {
    timeItemMap.set(timeItem.itemType, timeItem.itemValue);
  }

  // CODES: prefer first-class `matchUp.schedule.*` attributes; fall back to
  // the legacy timeItem entry. Records written in NATIVE / BRIDGE / LEGACY all
  // hydrate to the same shape.
  const firstClass = matchUp.schedule ?? {};
  const homeParticipantId = firstClass.homeParticipantId ?? timeItemMap.get(HOME_PARTICIPANT_ID);
  const courtAnnotation = firstClass.courtAnnotation ?? timeItemMap.get(COURT_ANNOTATION);
  const allocatedCourts = firstClass.allocatedCourts ?? timeItemMap.get(ALLOCATE_COURTS);
  const scheduledTime = firstClass.scheduledTime ?? timeItemMap.get(SCHEDULED_TIME);
  // SUPPRESSED, never cleared: the stored value is the operator's stated intent
  // and stays exactly where they put it. Hiding it here rather than deleting it
  // on score entry means the reverse case needs no rule of its own — remove the
  // score and the annotation is simply visible again, because the condition that
  // hid it has lapsed. It also means no score-entry path can forget: hydration is
  // downstream of the draw view, the schedule, the relay and every import.
  //
  // Read-side only. The write path (`matchUpTimeModifiers`, used by
  // `mutate/matchUps/schedule/scheduledTime.ts`) reads storage directly, so
  // adding and removing modifiers still operates on the real value.
  const storedTimeModifiers = firstClass.timeModifiers ?? timeItemMap.get(TIME_MODIFIERS);
  const timeModifiers = startIsSettled(matchUp) ? undefined : storedTimeModifiers;
  let scheduledDate = firstClass.scheduledDate ?? timeItemMap.get(SCHEDULED_DATE);
  const endDate = firstClass.endDate ?? timeItemMap.get(END_DATE);
  const official = firstClass.official ?? timeItemMap.get(ASSIGN_OFFICIAL);
  const scorekeeper = firstClass.scorekeeper ?? timeItemMap.get(ASSIGN_SCOREKEEPER);
  const timekeeper = firstClass.timekeeper ?? timeItemMap.get(ASSIGN_TIMEKEEPER);
  const courtOrder = firstClass.courtOrder ?? timeItemMap.get(COURT_ORDER);
  const venueId = firstClass.venueId ?? timeItemMap.get(ASSIGN_VENUE);
  const courtId = firstClass.courtId ?? timeItemMap.get(ASSIGN_COURT);
  // First-class only — a schedule lock has no legacy timeItem mirror. Hydrated
  // here (rather than merged in addMatchUpContext alongside calledAt) so that
  // the embargo filter strips it with the rest of the placement.
  const lock = firstClass.lock;

  const recoveryTimes = computeRecoveryTimes({
    scheduleTiming,
    afterRecoveryTimes,
    matchUpFormat,
    matchUpType,
    matchUp,
    endTime,
    scheduledTime,
  });

  if (!scheduledDate && scheduledTime) scheduledDate = extractDate(scheduledTime);

  const isoDateString = getIsoDateString({ scheduledDate, scheduledTime });

  const { venueName, venueAbbreviation, courtName, hydratedAllocatedCourts } = resolveVenueAndCourt({
    tournamentRecord,
    hydrationCache,
    allocatedCourts,
    venueId,
    courtId,
  });

  return definedAttributes({
    typeChangeTimeAfterRecovery: recoveryTimes.typeChangeTimeAfterRecovery,
    typeChangeRecoveryMinutes: recoveryTimes.typeChangeRecoveryMinutes,
    timeAfterRecovery: recoveryTimes.timeAfterRecovery,
    recoveryMinutes: recoveryTimes.recoveryMinutes,
    averageMinutes: recoveryTimes.averageMinutes,
    homeParticipantId,
    courtAnnotation,
    venueAbbreviation,
    lock,
    allocatedCourts: hydratedAllocatedCourts,
    scheduledDate,
    scheduledTime,
    isoDateString,
    endDate,
    timeModifiers,
    venueName,
    venueId,
    courtOrder,
    courtName,
    courtId,
    official,
    scorekeeper,
    timekeeper,
    milliseconds,
    startTime,
    endTime,
    time,
  });
}

function computeRecoveryTimes({
  scheduleTiming,
  afterRecoveryTimes,
  matchUpFormat,
  matchUpType,
  matchUp,
  endTime,
  scheduledTime,
}) {
  let timeAfterRecovery, averageMinutes, recoveryMinutes, typeChangeRecoveryMinutes, typeChangeTimeAfterRecovery;

  const eventType = matchUp.matchUpType ?? matchUpType;
  if (scheduleTiming && scheduledTime && afterRecoveryTimes && eventType) {
    // the fallbacks the scheduler reads too (C3): the default policy when none is attached, a timed format's own minutes
    // `scheduleTiming` is what `getScheduleTiming` returns, whatever the parameter's declared type says
    const resolvedScheduleTiming = scheduleTiming as unknown as Parameters<
      typeof resolveTimingDetails
    >[0]['scheduleTiming'];
    const timingDetails = resolveTimingDetails({
      matchUpFormat: matchUp.matchUpFormat ?? matchUpFormat,
      categoryType: resolvedScheduleTiming.categoryType,
      scheduleTiming: resolvedScheduleTiming,
    });
    ({
      averageMinutes = 0,
      recoveryMinutes = 0,
      typeChangeRecoveryMinutes = 0,
    } = matchUpFormatTimes({
      timingDetails,
      eventType,
    }));

    if (averageMinutes || recoveryMinutes) {
      timeAfterRecovery = endTime
        ? addMinutesToTimeString(extractTime(endTime), recoveryMinutes)
        : addMinutesToTimeString(scheduledTime, averageMinutes + recoveryMinutes);
    }
    if (typeChangeRecoveryMinutes) {
      typeChangeTimeAfterRecovery = endTime
        ? addMinutesToTimeString(extractTime(endTime), typeChangeRecoveryMinutes)
        : addMinutesToTimeString(scheduledTime, averageMinutes + typeChangeRecoveryMinutes);
    }
  }

  return { timeAfterRecovery, averageMinutes, recoveryMinutes, typeChangeRecoveryMinutes, typeChangeTimeAfterRecovery };
}

type AllocatedCourt = { venueId?: string; courtId?: string; [key: string]: unknown };

function resolveVenueAndCourt({ tournamentRecord, hydrationCache, allocatedCourts, venueId, courtId }) {
  const venueDataMap = {};
  const venueData =
    (tournamentRecord && venueId && getCachedVenueData({ hydrationCache, tournamentRecord, venueId })) ?? {};

  if (venueId) venueDataMap[venueId] = venueData;
  const { venueName, venueAbbreviation, courtsInfo } = venueData;

  const courtInfo = courtId && courtsInfo?.find((courtInfo) => courtInfo.courtId === courtId);
  const courtName = courtInfo?.courtName;

  // The allocatedCourts handed in are the STORED ones: the names go on new objects, never onto those.
  const hydratedAllocatedCourts = allocatedCourts?.map((allocatedCourt: AllocatedCourt) => {
    if (!tournamentRecord) return { ...allocatedCourt };
    if (allocatedCourt.venueId && !venueDataMap[allocatedCourt.venueId]) {
      venueDataMap[allocatedCourt.venueId] = getCachedVenueData({
        venueId: allocatedCourt.venueId,
        tournamentRecord,
        hydrationCache,
      });
    }
    const vData = allocatedCourt.venueId ? venueDataMap[allocatedCourt.venueId] : undefined;
    const cInfo = vData?.courtsInfo?.find((ci) => ci.courtId === allocatedCourt.courtId);
    return { ...allocatedCourt, venueName: vData?.venueName, courtName: cInfo?.courtName };
  });

  return { venueName, venueAbbreviation, courtName, hydratedAllocatedCourts };
}
