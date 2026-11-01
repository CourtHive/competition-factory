import { trimToTournamentRange } from '@Mutate/tournaments/tournamentDateTrims';
import { clearScheduledMatchUps } from '@Mutate/matchUps/schedule/clearScheduledMatchUps';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { modifiedVenueNotices, venueSnapshot } from '@Mutate/venues/venueNotices';
import { updateCourtAvailability } from '@Mutate/venues/updateCourtAvailability';
import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { modifyEventNotice } from '@Mutate/notifications/eventNotifications';
import { isValidWeekdaysValue } from '@Validators/isValidWeekdaysValue';
import { definedAttributes } from '@Tools/definedAttributes';
import { addNotice } from '@Global/state/globalState';
import { canonicalDate } from '@Tools/canonicalClock';
import { extractDate, generateDateRange } from '@Tools/dateTime';

// constants and types
import type { ActiveDateChange, TrimmedProfileDate } from '@Mutate/tournaments/tournamentDateTrims';
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

type TournamentDateBounds = {
  tournamentRecord: Tournament;
  startDate?: string;
  endDate?: string;
};

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
  // events whose dates changed to stay inside the new range (TRACKED, CLAMPED or RESET)
  eventDateChanges?: EventDateChange[];
  // active dates pruned from the tournament's list (no eventId) or an event's, as outside the new ranges
  activeDateChanges?: ActiveDateChange[];
  // what left the scheduling profile: its dates outside the new range, in profile shape
  trimmedSchedulingProfile?: TrimmedProfileDate[];
  datesRemoved?: string[];
  datesAdded?: string[];
} {
  const { tournamentRecord, startDate, endDate, weekdays, force } = params;
  const activeDates = params.activeDates?.filter(Boolean);

  const paramsCheck = checkRequiredParameters(params, [
    { tournamentRecord: true },
    {
      [VALIDATE]: (value) => !!canonicalDate(value),
      [INVALID]: INVALID_DATE,
      startDate: false,
      endDate: false,
    },
    {
      [VALIDATE]: (value) => value.filter(Boolean).every((d) => !!canonicalDate(d)),
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

  if (activeDates?.length && !activeDatesInRange({ tournamentRecord, activeDates, startDate, endDate }))
    return { error: INVALID_DATE };

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

  // refuse a removal of active dates that carry scheduled matchUps before anything is written
  if (activeDates) {
    const activeDatesError = activeDatesRemovalConflict({ tournamentRecord, activeDates });
    if (activeDatesError) return activeDatesError;
  }

  const previousStartDate = tournamentRecord.startDate;
  const previousEndDate = tournamentRecord.endDate;
  const initialDateRange = generateDateRange(tournamentRecord.startDate, tournamentRecord.endDate);
  if (startDate) tournamentRecord.startDate = startDate;
  if (endDate) tournamentRecord.endDate = endDate;
  const resultingDateRange = generateDateRange(tournamentRecord.startDate, tournamentRecord.endDate);
  const datesRemoved = initialDateRange.filter((date) => !resultingDateRange.includes(date));
  const datesAdded = resultingDateRange.filter((date) => !initialDateRange.includes(date));
  normalizeTournamentDateBounds({ tournamentRecord, startDate, endDate });

  const eventDateChanges = reconcileEventDates({ tournamentRecord, previousStartDate, previousEndDate });

  if (activeDates) tournamentRecord.activeDates = activeDates;
  if (weekdays) tournamentRecord.weekdays = weekdays;

  // a change of range leaves no active date or scheduling-profile date outside the new ranges
  const trims = trimToTournamentRange({ tournamentRecord, startDate, endDate });

  let unscheduledMatchUpIds: string[] | undefined;
  if (forcedUnscheduling) {
    const cleared = clearScheduledMatchUps({
      scheduledDates: forcedUnscheduling.scheduledDates,
      tournamentRecord,
    });
    if (!cleared.clearedScheduleCount) return { error: SCHEDULE_NOT_CLEARED };
    unscheduledMatchUpIds = forcedUnscheduling.matchUpIds;
  }

  // courts' dateAvailability follows the tournament dates: each venue whose courts changed is announced
  const venuesBefore = venueSnapshot(tournamentRecord);
  updateCourtAvailability({ tournamentRecord });
  modifiedVenueNotices({ tournamentRecord, snapshot: venuesBefore });
  addNotice({
    payload: definedAttributes({
      parentOrganisation: tournamentRecord.parentOrganisation,
      tournamentId: tournamentRecord.tournamentId,
      // pruned: the list that remains, [] when none remained and the list is unset
      activeDates: trims.prunedTournamentActiveDates ?? activeDates,
      startDate,
      weekdays,
      endDate,
    }),
    topic: MODIFY_TOURNAMENT_DETAIL,
  });

  return {
    ...SUCCESS,
    eventDateChanges: eventDateChanges.length ? eventDateChanges : undefined,
    trimmedSchedulingProfile: trims.trimmedSchedulingProfile,
    activeDateChanges: trims.activeDateChanges,
    unscheduledMatchUpIds,
    datesRemoved,
    datesAdded,
  };
}

export type EventDateChangeReason = 'TRACKED' | 'CLAMPED' | 'RESET';
export type EventDateChange = {
  reason: EventDateChangeReason;
  previousStartDate?: string;
  previousEndDate?: string;
  startDate?: string;
  endDate?: string;
  eventId: string;
};

const dayOf = (date?: string) => (date ? extractDate(date) : undefined);

/**
 * Keeps every event's range consistent with the tournament's new range (CA ruling R1, 2026-11-01):
 *
 * - TRACKED: an event whose range equalled the previous tournament range takes the new range, so
 *   extending, shrinking or shifting the tournament carries the events that were never narrowed.
 * - CLAMPED: an event with its own narrower range keeps it, cut to the part inside the new range.
 * - RESET: a narrower range that would lie entirely outside the new range has nothing left to keep;
 *   the event takes the tournament range (both dates), as a director's "set event dates to tournament
 *   dates" would. A collapsed one-day range on the edge would invent a playing day nobody chose.
 *
 * An event with no dates of its own is left alone: it already falls back to the tournament range.
 * Every event whose dates change gets MODIFY_EVENT and an entry in the returned list.
 */
function reconcileEventDates({
  tournamentRecord,
  previousStartDate,
  previousEndDate,
}: {
  tournamentRecord: Tournament;
  previousStartDate?: string;
  previousEndDate?: string;
}): EventDateChange[] {
  const tournamentStart = dayOf(tournamentRecord.startDate);
  const tournamentEnd = dayOf(tournamentRecord.endDate);
  const priorStart = dayOf(previousStartDate);
  const priorEnd = dayOf(previousEndDate);
  const changes: EventDateChange[] = [];

  for (const event of tournamentRecord.events ?? []) {
    const eventStart = dayOf(event.startDate);
    const eventEnd = dayOf(event.endDate);
    if (!eventStart && !eventEnd) continue;

    let reason: EventDateChangeReason;
    let startDate = event.startDate;
    let endDate = event.endDate;

    const tracked = !!priorStart && !!priorEnd && eventStart === priorStart && eventEnd === priorEnd;
    const disjoint =
      (!!eventStart && !!tournamentEnd && eventStart > tournamentEnd) ||
      (!!eventEnd && !!tournamentStart && eventEnd < tournamentStart);

    if (tracked || disjoint) {
      reason = tracked ? 'TRACKED' : 'RESET';
      startDate = tournamentRecord.startDate;
      endDate = tournamentRecord.endDate;
    } else {
      reason = 'CLAMPED';
      if (eventStart && tournamentStart && eventStart < tournamentStart) startDate = tournamentRecord.startDate;
      if (eventEnd && tournamentEnd && eventEnd > tournamentEnd) endDate = tournamentRecord.endDate;
    }

    if (startDate === event.startDate && endDate === event.endDate) continue;

    changes.push(
      definedAttributes({
        previousStartDate: event.startDate,
        previousEndDate: event.endDate,
        eventId: event.eventId,
        startDate,
        endDate,
        reason,
      }),
    );
    event.startDate = startDate;
    event.endDate = endDate;
    modifyEventNotice({ tournamentId: tournamentRecord.tournamentId, event });
  }

  return changes;
}

function activeDatesInRange({
  tournamentRecord,
  activeDates,
  startDate,
  endDate,
}: TournamentDateBounds & { activeDates: string[] }) {
  const start = startDate || tournamentRecord.startDate;
  const end = endDate || tournamentRecord.endDate;
  const validStart = !start || activeDates.every((d) => new Date(d) >= new Date(start));
  const validEnd = !end || activeDates.every((d) => new Date(d) <= new Date(end));
  return validStart && validEnd;
}

function normalizeTournamentDateBounds({ tournamentRecord, startDate, endDate }: TournamentDateBounds) {
  if (startDate && tournamentRecord.endDate && new Date(startDate) > new Date(tournamentRecord.endDate)) {
    tournamentRecord.endDate = startDate;
  }
  if (endDate && tournamentRecord.startDate && new Date(endDate) < new Date(tournamentRecord.startDate)) {
    tournamentRecord.startDate = endDate;
  }
}

function activeDatesRemovalConflict({
  tournamentRecord,
  activeDates,
}: {
  tournamentRecord: Tournament;
  activeDates: string[];
}) {
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
      };
    }
  }

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
