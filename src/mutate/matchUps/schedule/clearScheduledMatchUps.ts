import { resolveTournamentRecords } from '@Helpers/parameters/resolveTournamentRecords';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { modifyMatchUpNotice } from '@Mutate/notifications/drawNotifications';
import { allDrawMatchUps } from '@Query/matchUps/getAllDrawMatchUps';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import { findEvent } from '@Acquire/findEvent';
import { isObject } from '@Tools/objects';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { MatchUpStatusUnion, Tournament } from '@Types/tournamentTypes';
import { TournamentRecords, ResultType } from '@Types/factoryTypes';
import { SUCCESS } from '@Constants/resultConstants';
import {
  ErrorType,
  INVALID_VALUES,
  MISSING_TOURNAMENT_RECORD,
  MISSING_TOURNAMENT_RECORDS,
} from '@Constants/errorConditionConstants';
import {
  ALLOCATE_COURTS,
  ASSIGN_COURT,
  ASSIGN_VENUE,
  COURT_ANNOTATION,
  COURT_ORDER,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
} from '@Constants/timeItemConstants';

// Schedule-placement timeItem types (LEGACY / DUAL) and their first-class
// `matchUp.schedule.*` counterparts (NATIVE / DUAL). Kept in lockstep so an
// unschedule clears the same placement regardless of the record's write mode.
const SCHEDULE_ITEM_TYPES = new Set([
  ALLOCATE_COURTS,
  ASSIGN_COURT,
  ASSIGN_VENUE,
  COURT_ANNOTATION,
  COURT_ORDER,
  SCHEDULED_DATE,
  SCHEDULED_TIME,
]);
const SCHEDULE_FIRST_CLASS_ATTRIBUTES = [
  'allocatedCourts', // ALLOCATE_COURTS
  'courtId', // ASSIGN_COURT
  'venueId', // ASSIGN_VENUE
  'courtAnnotation', // COURT_ANNOTATION
  'courtOrder', // COURT_ORDER
  'scheduledDate', // SCHEDULED_DATE
  'scheduledTime', // SCHEDULED_TIME
  // first-class only (no timeItem mirror): the "called to court" stamp. A full
  // unschedule must drop it too — otherwise an unscheduled matchUp keeps a stale
  // "called" marker with no placement behind it.
  'calledAt',
];

type ClearScheduledMatchUpsArgs = {
  ignoreMatchUpStatuses?: MatchUpStatusUnion[];
  tournamentRecords?: TournamentRecords;
  tournamentRecord?: Tournament;
  scheduleAttributes?: string[];
  scheduledDates: string[];
  venueIds?: string[];
};
export function clearScheduledMatchUps(params: ClearScheduledMatchUpsArgs): ResultType & {
  clearedScheduleCount?: number;
} {
  const {
    scheduleAttributes = ['scheduledDate', 'scheduledTime', 'courtOrder'],
    ignoreMatchUpStatuses = completedMatchUpStatuses,
    scheduledDates,
    venueIds,
  } = params;

  const tournamentRecords = resolveTournamentRecords(params);

  const tournamentIds = isObject(tournamentRecords)
    ? Object.values(tournamentRecords)
        .map(({ tournamentId }) => tournamentId)
        .filter(Boolean)
    : [];
  if (!tournamentIds?.length) return { error: MISSING_TOURNAMENT_RECORDS };

  let clearedScheduleCount = 0;
  for (const tournamentId of tournamentIds) {
    const tournamentRecord = tournamentRecords[tournamentId];
    const result = clearSchedules({
      ignoreMatchUpStatuses,
      scheduleAttributes,
      tournamentRecord,
      scheduledDates,
      venueIds,
    });
    if (result.error) return result;
    clearedScheduleCount += result.clearedScheduleCount ?? 0;
  }

  return { ...SUCCESS, clearedScheduleCount };
}

function clearSchedules({
  scheduleAttributes = ['scheduledDate', 'scheduledTime', 'courtOrder'],
  ignoreMatchUpStatuses = completedMatchUpStatuses,
  tournamentRecord,
  scheduledDates,
  venueIds = [],
}: ClearScheduledMatchUpsArgs): {
  clearedScheduleCount?: number;
  success?: boolean;
  error?: ErrorType;
} {
  if (typeof tournamentRecord !== 'object') return { error: MISSING_TOURNAMENT_RECORD };

  if (!Array.isArray(ignoreMatchUpStatuses) || !Array.isArray(venueIds)) {
    return { error: INVALID_VALUES };
  }
  if (venueIds.length) scheduleAttributes.push('venueId');

  const inContextMatchUps =
    allTournamentMatchUps({
      matchUpFilters: { scheduledDates },
      tournamentRecord,
    }).matchUps ?? [];

  const drawMatchUpIds = {};

  inContextMatchUps.forEach(({ matchUpStatus, schedule, drawId, matchUpId }) => {
    if (
      (!matchUpStatus || !ignoreMatchUpStatuses.includes(matchUpStatus)) &&
      hasSchedule({ schedule, scheduleAttributes }) &&
      (!venueIds?.length || venueIds.includes(schedule?.venueId ?? ''))
    ) {
      if (!drawMatchUpIds[drawId]) drawMatchUpIds[drawId] = [];
      drawMatchUpIds[drawId].push(matchUpId);
    }
  });

  const tournamentId = tournamentRecord.tournamentId;
  let clearedScheduleCount = 0;

  for (const drawId in drawMatchUpIds) {
    const { event, drawDefinition } = findEvent({ tournamentRecord, drawId });
    const drawMatchUps =
      allDrawMatchUps({ drawDefinition, matchUpFilters: { matchUpIds: drawMatchUpIds[drawId] } }).matchUps ?? [];

    for (const matchUp of drawMatchUps) {
      let modified = false;
      // LEGACY / DUAL records store schedule data as timeItems — strip them.
      matchUp.timeItems = (matchUp.timeItems ?? []).filter((timeItem) => {
        const preserve = timeItem?.itemType && !SCHEDULE_ITEM_TYPES.has(timeItem?.itemType);
        if (!preserve) modified = true;
        return preserve;
      });
      // NATIVE / DUAL records store schedule data as first-class `matchUp.schedule.*`
      // attributes (CODES Phase 2) with no timeItem mirror. Without clearing these the
      // unschedule is a no-op in production NATIVE mode — the divergence that surfaced
      // as SCHEDULE_NOT_CLEARED when a date change tried to force-unschedule matchUps.
      if (matchUp.schedule && typeof matchUp.schedule === 'object') {
        for (const attribute of SCHEDULE_FIRST_CLASS_ATTRIBUTES) {
          if (matchUp.schedule[attribute] !== undefined) {
            delete matchUp.schedule[attribute];
            modified = true;
          }
        }
      }
      if (modified) {
        modifyMatchUpNotice({
          context: 'clear schedules',
          eventId: event?.eventId,
          drawDefinition,
          tournamentId,
          matchUp,
        });
        clearedScheduleCount += 1;
      }
    }
  }

  return { ...SUCCESS, clearedScheduleCount };
}
