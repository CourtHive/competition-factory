import { getScheduledCourtMatchUps } from '@Query/venues/getScheduledCourtMatchUps';
import { validDateAvailability } from '@Validators/validateDateAvailability';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { requireParams } from '@Helpers/parameters/requireParams';
import { minutesDifference, timeToDate } from '@Tools/dateTime';
import { findCourt } from '../../query/venues/findCourt';
import { addNotice } from '@Global/state/globalState';
import { startTimeSort } from '@Validators/time';

import { ErrorType, SCHEDULE_CONFLICT_COURT_UNAVAILABLE } from '@Constants/errorConditionConstants';
import { TOURNAMENT_RECORD, COURT_ID } from '@Constants/attributeConstants';
import { POLICY_TYPE_SCHEDULING } from '@Constants/policyConstants';
import { Availability, Tournament } from '@Types/tournamentTypes';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { HydratedMatchUp } from '@Types/hydrated';

type ModifyCourtAvailabilityArgs = {
  venueMatchUps?: HydratedMatchUp[];
  dateAvailability: Availability[];
  tournamentRecord: Tournament;
  disableNotice?: boolean;
  courtId: string;
  force?: boolean;
};
export function modifyCourtAvailability({
  tournamentRecord,
  dateAvailability,
  disableNotice,
  venueMatchUps,
  courtId,
  force,
}: ModifyCourtAvailabilityArgs): {
  error?: ErrorType;
  success?: boolean;
  totalMergeCount?: number;
  matchUpIds?: string[];
  info?: string;
} {
  const paramsCheck = requireParams({ tournamentRecord, courtId }, [TOURNAMENT_RECORD, COURT_ID]);
  if (paramsCheck.error) return paramsCheck;

  const dateResult = validDateAvailability({ dateAvailability });
  if (dateResult.error) return dateResult;

  const { updatedDateAvailability, totalMergeCount } = sortAndMergeDateAvailability(dateAvailability);
  dateAvailability = updatedDateAvailability;

  const courtResult = findCourt({ tournamentRecord, courtId });
  if (courtResult.error) return courtResult;
  const { court, venue } = courtResult;

  const { matchUps: courtMatchUps } = getScheduledCourtMatchUps({
    tournamentRecord,
    venueMatchUps,
    courtId,
  });

  // In the first instance, matchUps which are explicitly scheduled on the court for times which are no longer available
  // NOTE: see dateAvailability.test.ts
  if (courtMatchUps?.length) {
    const appliedPolicies = getAppliedPolicies({
      tournamentRecord,
    })?.appliedPolicies;

    const allowModificationWhenMatchUpsScheduled =
      force ?? appliedPolicies?.[POLICY_TYPE_SCHEDULING]?.allowDeletionWithScoresPresent?.courts;

    // Check each scheduled matchUp against the new availability windows
    const matchUpsWithInvalidScheduling = courtMatchUps.filter((matchUp) => {
      const { scheduledDate, scheduledTime } = matchUp.schedule ?? {};
      if (!scheduledDate || !scheduledTime) return false;

      // Find availability windows for this date
      const dateWindows = dateAvailability.filter((a) => a.date === scheduledDate);
      if (!dateWindows.length) return true; // no availability for this date

      // Check if the scheduled time falls within any availability window
      const matchUpTime = timeToDate(scheduledTime);
      return !dateWindows.some((window) => {
        const windowStart = timeToDate(window.startTime);
        const windowEnd = timeToDate(window.endTime);
        return (
          minutesDifference(windowStart, matchUpTime, false) <= 0 &&
          minutesDifference(matchUpTime, windowEnd, false) <= 0
        );
      });
    });

    if (matchUpsWithInvalidScheduling.length && !allowModificationWhenMatchUpsScheduled) {
      return {
        error: SCHEDULE_CONFLICT_COURT_UNAVAILABLE,
        info: `${matchUpsWithInvalidScheduling.length} matchUp(s) scheduled outside new availability`,
        matchUpIds: matchUpsWithInvalidScheduling.map((m) => m.matchUpId),
      };
    }
    // when allowModificationWhenMatchUpsScheduled is true, proceed — availability will be updated below
    // and affected matchUps will need to be rescheduled by the caller
  }

  if (court) {
    court.dateAvailability = dateAvailability;

    if (!disableNotice && venue)
      addNotice({
        payload: { venue, tournamentId: tournamentRecord.tournamentId },
        topic: MODIFY_VENUE,
        key: venue.venueId,
      });
  }

  return { ...SUCCESS, totalMergeCount };
}

function sortAndMergeDateAvailability(dateAvailability) {
  let totalMergeCount = 0;

  const availabilityByDate = dateAvailability.reduce((byDate, availability) => {
    const { date, startTime, endTime, bookings } = availability;
    if (!byDate[date]) byDate[date] = [];
    byDate[date].push({ startTime, endTime, bookings });
    return byDate;
  }, {});

  const updatedDateAvailability: any[] = [];

  Object.keys(availabilityByDate).forEach((date) => {
    availabilityByDate[date].sort(startTimeSort);
    const { mergedAvailability, mergeCount } = getMergedAvailability(availabilityByDate[date]);
    updatedDateAvailability.push(
      ...mergedAvailability.map((availability: any) => ({
        date,
        ...availability,
      })),
    );
    totalMergeCount += mergeCount;
  });

  return { updatedDateAvailability, totalMergeCount };
}

function getMergedAvailability(dateDetails) {
  let lastStartTime,
    lastEndTime,
    lastBookings,
    safety = dateDetails.length,
    mergeCount = 0;
  const mergedAvailability: any[] = [];

  while (dateDetails.length && safety) {
    const details = dateDetails.shift();
    const { startTime, endTime, bookings } = details;
    safety -= 1;

    if (lastStartTime) {
      const difference = minutesDifference(timeToDate(lastEndTime), timeToDate(startTime), false);

      if (difference > 0) {
        const availability: any = {
          startTime: lastStartTime,
          endTime: lastEndTime,
        };
        if (lastBookings?.length) availability.bookings = lastBookings;
        mergedAvailability.push(availability);
        lastStartTime = startTime;
        lastBookings = bookings;
        lastEndTime = endTime;
      } else {
        if (bookings) {
          if (lastBookings) {
            lastBookings.push(bookings);
          } else {
            lastBookings = bookings;
          }
        }
        lastEndTime = endTime;
        mergeCount += 1;
      }
    } else {
      lastStartTime = startTime;
      lastBookings = bookings;
      lastEndTime = endTime;
    }
  }
  const availability: any = { startTime: lastStartTime, endTime: lastEndTime };
  if (lastBookings?.length) availability.bookings = lastBookings;
  mergedAvailability.push(availability);

  return { mergedAvailability, mergeCount };
}
