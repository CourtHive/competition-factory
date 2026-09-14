import { getScheduledCourtMatchUps } from '@Query/venues/getScheduledCourtMatchUps';
import { validDateAvailability } from '@Validators/validateDateAvailability';
import { getAppliedPolicies } from '@Query/extensions/getAppliedPolicies';
import { requireParams } from '@Helpers/parameters/requireParams';
import { minutesDifference, timeToDate } from '@Tools/dateTime';
import { addNotice } from '@Global/state/globalState';
import { findCourt } from '@Query/venues/findCourt';
import { startTimeSort } from '@Validators/time';

// constants and types
import { ErrorType, SCHEDULE_CONFLICT_COURT_UNAVAILABLE } from '@Constants/errorConditionConstants';
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
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

    // Check each scheduled matchUp against the new availability windows.
    // Completed matchUps are historical — their schedule reflects what
    // already happened, not future commitments. Modifying court availability
    // should never be blocked by play that has already concluded.
    const matchUpsWithInvalidScheduling = courtMatchUps.filter((matchUp) => {
      if (matchUp.matchUpStatus && completedMatchUpStatuses.includes(matchUp.matchUpStatus)) return false;
      if (matchUp.winningSide) return false;
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

/**
 * Group by date, merge overlapping windows within each date, and flatten back.
 *
 * ── Why a Map and not an object ──
 *
 * `Availability.date` is OPTIONAL, and deliberately so: an entry with no date is
 * a court's default availability, `validateDate` passes it on purpose, and the
 * mocks generate one. An object keyed by date coerces that `undefined` into the
 * literal string key `"undefined"`, which `Object.keys` then hands back as the
 * date to write — so a single round-trip turned a court's default window into
 *
 *   { date: "undefined", startTime: "07:00", endTime: "19:00" }
 *
 * an entry matching no real day, with the default silently gone. Every caller
 * that reads a court's `dateAvailability`, edits one day and writes the array
 * back hit this; TMX's court-capacity popover does exactly that.
 *
 * A `Map` keys by value, so `undefined` stays `undefined` and the flatten step
 * can omit the property entirely rather than inventing one.
 */
function sortAndMergeDateAvailability(dateAvailability) {
  let totalMergeCount = 0;

  const availabilityByDate = new Map<string | undefined, any[]>();
  for (const availability of dateAvailability) {
    const { date, startTime, endTime, bookings } = availability;
    const entries = availabilityByDate.get(date);
    if (entries) entries.push({ startTime, endTime, bookings });
    else availabilityByDate.set(date, [{ startTime, endTime, bookings }]);
  }

  const updatedDateAvailability: any[] = [];

  for (const [date, entries] of availabilityByDate) {
    entries.sort(startTimeSort);
    const { mergedAvailability, mergeCount } = getMergedAvailability(entries);
    updatedDateAvailability.push(
      // `date` is spread in only when there is one. Writing `date: undefined`
      // would survive a structuredClone into the record and read as a present
      // key holding nothing, which is a third state nobody asked for.
      ...mergedAvailability.map((availability: any) =>
        date === undefined ? { ...availability } : { date, ...availability },
      ),
    );
    totalMergeCount += mergeCount;
  }

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
