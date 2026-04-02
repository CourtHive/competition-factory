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
import { INVALID_DATE, INVALID_VALUES, SCHEDULE_NOT_CLEARED } from '@Constants/errorConditionConstants';
import { MODIFY_TOURNAMENT_DETAIL } from '@Constants/topicConstants';
import { INVALID, VALIDATE } from '@Constants/attributeConstants';
import { Tournament, WeekdayUnion } from '@Types/tournamentTypes';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';

type SetTournamentDatesArgs = {
  tournamentRecord: Tournament;
  weekdays?: WeekdayUnion[];
  activeDates?: string[];
  startDate?: string;
  endDate?: string;
};
export function setTournamentDates(params: SetTournamentDatesArgs): ResultType & {
  unscheduledMatchUpIds?: string[];
  datesRemoved?: string[];
  datesAdded?: string[];
} {
  const { tournamentRecord, startDate, endDate, weekdays } = params;
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

  const unscheduledMatchUpIds = checkScheduling && removeInvalidScheduling({ tournamentRecord })?.unscheduledMatchUpIds;

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

  return { ...SUCCESS, unscheduledMatchUpIds, datesAdded, datesRemoved };
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
      const dates = [...new Set(conflicting.map((m) => m.schedule!.scheduledDate))].sort();
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

export function setTournamentStartDate({ tournamentRecord, startDate }) {
  if (!startDate) return { error: INVALID_DATE };
  return setTournamentDates({ tournamentRecord, startDate });
}

export function setTournamentEndDate({ tournamentRecord, endDate }) {
  if (!endDate) return { error: INVALID_DATE };
  return setTournamentDates({ tournamentRecord, endDate });
}

// unschedule scheduled matchUps that fall outside of tournament dates
export function removeInvalidScheduling({ tournamentRecord }) {
  const matchUps = allTournamentMatchUps({ tournamentRecord }).matchUps ?? [];

  const startDate = tournamentRecord.startDate && new Date(tournamentRecord.startDate);
  const endDate = tournamentRecord.endDate && new Date(tournamentRecord.endDate);

  const invalidScheduledDates: string[] = [];
  const invalidSchedulingMatchUpIds: string[] = [];
  for (const matchUp of matchUps) {
    const { schedule, matchUpId } = matchUp;
    if (!schedule) continue;
    if (schedule.scheduledDate) {
      const scheduledDate = new Date(schedule.scheduledDate);
      if ((startDate && scheduledDate < startDate) || (endDate && scheduledDate > endDate)) {
        invalidSchedulingMatchUpIds.push(matchUpId);
        if (!invalidScheduledDates.includes(schedule.scheduledDate)) invalidScheduledDates.push(schedule.scheduledDate);
      }
    }
  }

  if (invalidScheduledDates.length) {
    const result = clearScheduledMatchUps({
      scheduledDates: invalidScheduledDates,
      tournamentRecord,
    });
    if (!result.clearedScheduleCount) return { error: SCHEDULE_NOT_CLEARED };
  }

  return { unscheduledMatchUpIds: invalidSchedulingMatchUpIds };
}
