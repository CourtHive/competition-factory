import { clearScheduledMatchUps } from '@Mutate/matchUps/schedule/clearScheduledMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { updateCourtAvailability } from '@Mutate/venues/updateCourtAvailability';
import { isValidWeekdaysValue } from '@Validators/isValidWeekdaysValue';
import { definedAttributes } from '@Tools/definedAttributes';
import { addNotice } from '@Global/state/globalState';
import { generateDateRange } from '@Tools/dateTime';
import { dateValidation } from '@Validators/regex';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { INVALID, VALIDATE } from '@Constants/attributeConstants';
import { Tournament, WeekdayUnion } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  INVALID_DATE,
  INVALID_VALUES,
  MATCHUPS_COMPLETED_OUTSIDE_DATES,
  MATCHUPS_SCHEDULED_OUTSIDE_DATES,
  SCHEDULE_NOT_CLEARED,
} from '@Constants/errorConditionConstants';

type SetTournamentDatesArgs = {
  tournamentRecord: Tournament;
  weekdays?: WeekdayUnion[];
  activeDates?: string[];
  startDate?: string;
  endDate?: string;
  // when true, proceed with the date change and unschedule any matchUps that fall
  // outside the new range (rather than rejecting with MATCHUPS_SCHEDULED_OUTSIDE_DATES)
  force?: boolean;
};
export function setTournamentDates(params: SetTournamentDatesArgs): ResultType & {
  // matchUpIds / dates scheduled outside the requested range (populated on the rejection path)
  outOfRangeMatchUpIds?: string[];
  outOfRangeDates?: string[];
  // completed matchUps played outside the requested range — a hard block that force
  // cannot override (unscheduling would erase the record of when a match was played)
  completedOutOfRangeMatchUpIds?: string[];
  completedOutOfRangeDates?: string[];
  // matchUpIds unscheduled when force: true was used to push past the rejection
  unscheduledMatchUpIds?: string[];
  datesRemoved?: string[];
  datesAdded?: string[];
} {
  const { tournamentRecord, startDate, endDate, weekdays, force } = params;
  const activeDates = params.activeDates?.filter(Boolean);

  const paramsCheck = checkRequiredParameters(params, [
    { tournamentRecord: true },
    {
      [VALIDATE]: (value) => dateValidation.test(value),
      [INVALID]: INVALID_DATE,
      startDate: false,
      endDate: false,
    },
    {
      [VALIDATE]: (value) => value.filter(Boolean).every((d) => dateValidation.test(d)),
      [INVALID]: INVALID_DATE,
      activeDates: false,
    },
    {
      [VALIDATE]: isValidWeekdaysValue,
      weekdays: false,
    },
  ]);
  if (paramsCheck.error) return paramsCheck;

  if (endDate && startDate && new Date(endDate) < new Date(startDate)) return { error: INVALID_VALUES };
  if (endDate && startDate && new Date(startDate) > new Date(endDate)) return { error: INVALID_VALUES };

  if (activeDates?.length) {
    const start = startDate || tournamentRecord.startDate;
    const end = endDate || tournamentRecord.endDate;
    const validStart = !start || activeDates.every((d) => new Date(d) >= new Date(start));
    const validEnd = !end || activeDates.every((d) => new Date(d) <= new Date(end));
    if (!validStart || !validEnd) return { error: INVALID_DATE };
  }

  let checkScheduling;
  // if start has moved closer to end or end has moved closer to start, check for scheduling issues
  if (
    (startDate && tournamentRecord.startDate && new Date(startDate) > new Date(tournamentRecord.startDate)) ||
    (endDate && tournamentRecord.endDate && new Date(endDate) < new Date(tournamentRecord.endDate))
  ) {
    checkScheduling = true;
  }

  // When matchUps are scheduled outside the prospective new range, reject by default
  // (checked before any mutation so the record is left untouched). With force: true the
  // caller has explicitly opted in to unscheduling them — defer the clear until after the
  // new dates are applied.
  let forcedUnscheduling: { scheduledDates: string[]; matchUpIds: string[] } | undefined;
  if (checkScheduling) {
    const prospectiveStart = startDate ?? tournamentRecord.startDate;
    const prospectiveEnd = endDate ?? tournamentRecord.endDate;
    const { scheduledDates, matchUpIds, completedDates, completedMatchUpIds } = findMatchUpsScheduledOutsideDates({
      tournamentRecord,
      startDate: prospectiveStart,
      endDate: prospectiveEnd,
    });

    // Completed matchUps were actually played on those dates, so the tournament range
    // MUST include them. This is a hard block that force cannot override — unscheduling
    // a completed matchUp would erase the record of when it was played, and a date on
    // which a match occurred cannot fall outside the tournament. (Reported separately
    // from the clearable, non-completed matchUps below so callers never offer an
    // "unschedule" action that clearScheduledMatchUps would refuse — the divergence
    // that previously surfaced as a misleading SCHEDULE_NOT_CLEARED error.)
    if (completedDates.length) {
      const sorted = completedDates.toSorted((a, b) => a.localeCompare(b));
      return {
        error: {
          ...MATCHUPS_COMPLETED_OUTSIDE_DATES,
          message: `Cannot change tournament dates: completed matchUps were played outside the new range on ${sorted.join(', ')}`,
        },
        info: `${completedMatchUpIds.length} completed matchUp(s) played outside ${prospectiveStart} - ${prospectiveEnd}`,
        completedOutOfRangeMatchUpIds: completedMatchUpIds,
        completedOutOfRangeDates: sorted,
      };
    }

    if (scheduledDates.length) {
      const sorted = scheduledDates.toSorted((a, b) => a.localeCompare(b));
      if (force) {
        forcedUnscheduling = { scheduledDates: sorted, matchUpIds };
      } else {
        return {
          error: {
            ...MATCHUPS_SCHEDULED_OUTSIDE_DATES,
            message: `Cannot change tournament dates with matchUps scheduled outside the new range: ${sorted.join(', ')}`,
          },
          info: `${matchUpIds.length} matchUp(s) scheduled outside ${prospectiveStart} - ${prospectiveEnd}`,
          outOfRangeMatchUpIds: matchUpIds,
          outOfRangeDates: sorted,
        };
      }
    }
  }

  const initialDateRange = generateDateRange(tournamentRecord.startDate, tournamentRecord.endDate);
  if (startDate) tournamentRecord.startDate = startDate;
  if (endDate) tournamentRecord.endDate = endDate;
  const resultingDateRange = generateDateRange(tournamentRecord.startDate, tournamentRecord.endDate);
  const datesRemoved = initialDateRange.filter((date) => !resultingDateRange.includes(date));
  const datesAdded = resultingDateRange.filter((date) => !initialDateRange.includes(date));

  coerceEventDates({ tournamentRecord, startDate, endDate });
  normalizeTournamentDateBounds({ tournamentRecord, startDate, endDate });

  if (activeDates) {
    const activeDatesError = validateAndApplyActiveDates({ tournamentRecord, activeDates });
    if (activeDatesError) return activeDatesError;
  }
  if (weekdays) tournamentRecord.weekdays = weekdays;

  let unscheduledMatchUpIds: string[] | undefined;
  if (forcedUnscheduling) {
    const cleared = clearScheduledMatchUps({
      scheduledDates: forcedUnscheduling.scheduledDates,
      tournamentRecord,
    });
    if (!cleared.clearedScheduleCount) return { error: SCHEDULE_NOT_CLEARED };
    unscheduledMatchUpIds = forcedUnscheduling.matchUpIds;
  }

  updateCourtAvailability({ tournamentRecord });
  addNotice({
    payload: definedAttributes({
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      activeDates,
      startDate,
      weekdays,
      endDate,
    }),
    topic: MODIFY_TOURNAMENT_DETAIL,
  });

  return { ...SUCCESS, datesAdded, datesRemoved, unscheduledMatchUpIds };
}

function coerceEventDates({ tournamentRecord, startDate, endDate }) {
  for (const event of tournamentRecord.events ?? []) {
    if (startDate && event.startDate && new Date(event.startDate) < new Date(startDate)) event.startDate = startDate;
    if (endDate && event.startDate && new Date(event.startDate) > new Date(endDate))
      event.startDate = startDate ?? endDate;
    if (endDate && event.endDate && new Date(event.endDate) > new Date(endDate)) event.endDate = endDate;
    if (startDate && event.endDate && new Date(event.endDate) < new Date(startDate))
      event.endDate = endDate ?? startDate;
  }
}

function normalizeTournamentDateBounds({ tournamentRecord, startDate, endDate }) {
  if (startDate && tournamentRecord.endDate && new Date(startDate) > new Date(tournamentRecord.endDate)) {
    tournamentRecord.endDate = startDate;
  }
  if (endDate && tournamentRecord.startDate && new Date(endDate) < new Date(tournamentRecord.startDate)) {
    tournamentRecord.startDate = endDate;
  }
}

function validateAndApplyActiveDates({ tournamentRecord, activeDates }) {
  const previousActiveDates: string[] = (tournamentRecord.activeDates as string[]) ?? [];
  const activeDatesSet = new Set(activeDates);
  const removedDates = previousActiveDates.filter((d) => !activeDatesSet.has(d));

  if (removedDates.length) {
    const matchUps = allTournamentMatchUps({ tournamentRecord }).matchUps ?? [];
    const removedSet = new Set(removedDates);
    const conflicting = matchUps.filter((m) => m.schedule?.scheduledDate && removedSet.has(m.schedule.scheduledDate));
    if (conflicting.length) {
      const dates = [...new Set(conflicting.map((m) => m.schedule!.scheduledDate))].sort((a, b) =>
        (a ?? '').localeCompare(b ?? ''),
      );
      return {
        error: {
          ...INVALID_VALUES,
          message: `Cannot remove active dates with scheduled matchUps: ${dates.join(', ')}`,
        },
        info: `${conflicting.length} matchUp(s) scheduled on dates being removed`,
      } as any;
    }
  }

  tournamentRecord.activeDates = activeDates;
  return undefined;
}

export function setTournamentStartDate({ tournamentRecord, startDate, force }) {
  if (!startDate) return { error: INVALID_DATE };
  return setTournamentDates({ tournamentRecord, startDate, force });
}

export function setTournamentEndDate({ tournamentRecord, endDate, force }) {
  if (!endDate) return { error: INVALID_DATE };
  return setTournamentDates({ tournamentRecord, endDate, force });
}

// detect scheduled matchUps that fall outside of the given tournament date range.
// Completed matchUps are reported separately (completedDates/completedMatchUpIds) because
// they cannot be unscheduled to make room for a date change — a match played on a date
// forces that date into the tournament range. Non-completed matchUps remain in
// scheduledDates/matchUpIds and stay clearable via `force`.
export function findMatchUpsScheduledOutsideDates({ tournamentRecord, startDate, endDate }) {
  const matchUps = allTournamentMatchUps({ tournamentRecord }).matchUps ?? [];

  const start = startDate && new Date(startDate);
  const end = endDate && new Date(endDate);

  const scheduledDates: string[] = [];
  const matchUpIds: string[] = [];
  const completedDates: string[] = [];
  const completedMatchUpIds: string[] = [];
  for (const matchUp of matchUps) {
    const scheduledDate = matchUp.schedule?.scheduledDate;
    if (!scheduledDate) continue;
    const date = new Date(scheduledDate);
    if ((start && date < start) || (end && date > end)) {
      if (matchUp.matchUpStatus && completedMatchUpStatuses.includes(matchUp.matchUpStatus)) {
        completedMatchUpIds.push(matchUp.matchUpId);
        if (!completedDates.includes(scheduledDate)) completedDates.push(scheduledDate);
      } else {
        matchUpIds.push(matchUp.matchUpId);
        if (!scheduledDates.includes(scheduledDate)) scheduledDates.push(scheduledDate);
      }
    }
  }

  return { scheduledDates, matchUpIds, completedDates, completedMatchUpIds };
}
