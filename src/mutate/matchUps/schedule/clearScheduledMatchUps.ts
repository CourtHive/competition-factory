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
      (!venueIds?.length || venueIds.includes(schedule.venueId))
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
      matchUp.timeItems = (matchUp.timeItems ?? []).filter((timeItem) => {
        const preserve =
          timeItem?.itemType &&
          ![ALLOCATE_COURTS, ASSIGN_COURT, ASSIGN_VENUE, COURT_ANNOTATION, COURT_ORDER, SCHEDULED_DATE, SCHEDULED_TIME].includes(
            timeItem?.itemType,
          );
        if (!preserve) modified = true;
        return preserve;
      });
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
