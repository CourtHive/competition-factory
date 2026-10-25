import { EventBookingTimings, generateBookings } from './generateBookings';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { getScheduleTimes } from '@Query/venues/getScheduleTimes';
import { calculatePeriodLength } from './calculatePeriodLength';
import { getMatchUpId } from '@Functions/global/extractors';
import { getDateTimeBoundary } from './getTimeBoundary';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { HydratedCourt, HydratedMatchUp } from '@Types/hydrated';
import { ScheduleTimesResult } from '@Types/factoryTypes';
import { Tournament } from '@Types/tournamentTypes';

type GenerateScheduleTimesArgs = {
  /** the courts available on the date, already resolved (`ignoreDisabled` for the date): when given with
   * `eventTimings`, no record is read */
  dateCourts?: HydratedCourt[];
  eventTimings?: EventBookingTimings;
  tournamentRecords?: { [key: string]: Tournament };
  calculateStartTimeFromCourts?: boolean;
  remainingScheduleTimes?: string[];
  defaultRecoveryMinutes?: number;
  averageMatchUpMinutes?: number;
  tournamentRecord?: Tournament;
  clearScheduleDates?: boolean | string[];
  matchUps?: HydratedMatchUp[];
  courtIds?: string[];
  periodLength?: number;
  scheduleDate: string;
  venueIds: string[];
  startTime?: string;
  endTime?: string;
};

export function generateScheduleTimes({
  calculateStartTimeFromCourts = true,
  remainingScheduleTimes,
  defaultRecoveryMinutes,
  averageMatchUpMinutes,
  clearScheduleDates,
  tournamentRecords,
  tournamentRecord,
  eventTimings,
  periodLength,
  scheduleDate,
  dateCourts,
  startTime,
  venueIds,
  courtIds,
  matchUps,
  endTime,
}: GenerateScheduleTimesArgs): {
  dateScheduledMatchUps?: HydratedMatchUp[];
  unbookedMatchUpIds?: string[];
  scheduleTimes?: ScheduleTimesResult[];
  dateScheduledMatchUpIds?: string[];
  error?: ErrorType;
  venueId?: string;
} {
  if (tournamentRecord && !tournamentRecords) {
    tournamentRecords = { [tournamentRecord.tournamentId]: tournamentRecord };
  }
  const resolved = dateCourts && eventTimings;
  if (!resolved && (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length))
    return { error: MISSING_TOURNAMENT_RECORDS };

  periodLength =
    periodLength ??
    calculatePeriodLength({
      recoveryMinutes: defaultRecoveryMinutes,
      averageMatchUpMinutes,
    });

  const { courts: allCourts, venues } = resolved
    ? { courts: dateCourts, venues: undefined }
    : getVenuesAndCourts({ dates: [scheduleDate], ignoreDisabled: true, tournamentRecords });

  // courtIds, when provided, narrows capacity to the selected courts of the venues
  const courts =
    allCourts?.filter(
      (court) => (!venueIds || venueIds.includes(court.venueId)) && (!courtIds || courtIds.includes(court.courtId)),
    ) ?? [];

  startTime = startTime ?? getDateTimeBoundary({ courts, scheduleDate, startTime: true });
  endTime = endTime ?? getDateTimeBoundary({ courts, scheduleDate, endTime: true });

  // the tournament's only venue with courts on the date, if it has exactly one: a matchUp timed with no venue is there
  const dateVenueIds = new Set((venues ?? allCourts ?? []).map(({ venueId }) => venueId));
  const soleVenueId = dateVenueIds.size === 1 ? [...dateVenueIds][0] : undefined;

  const bookingsResult = generateBookings({
    defaultRecoveryMinutes,
    averageMatchUpMinutes,
    tournamentRecords,
    eventTimings,
    scheduleDate,
    periodLength,
    soleVenueId,
    venueIds,
    matchUps,
  });
  // a booking that cannot be read must not leave every court reading as free: the error is returned, never ignored
  if (bookingsResult.error) return { error: bookingsResult.error };
  const { bookings, dateScheduledMatchUps } = bookingsResult;

  const timingParameters = {
    calculateStartTimeFromCourts,
    remainingScheduleTimes,
    averageMatchUpMinutes,
    clearScheduleDates,
    date: scheduleDate,
    periodLength,
    startTime,
    bookings,
    endTime,
    courts,
  };
  const { scheduleTimes, unbookedMatchUpIds } = getScheduleTimes(timingParameters);

  // if a single venue specified, or only one venue available, return venueId
  const venueId = (venueIds?.length === 1 && venueIds[0]) || (venues?.length === 1 && venues[0].venueId) || undefined;

  // the ids read directly: `xa` deep-copies the whole hydrated matchUp to read one attribute
  const dateScheduledMatchUpIds = dateScheduledMatchUps?.map(getMatchUpId);

  return {
    dateScheduledMatchUpIds,
    dateScheduledMatchUps,
    unbookedMatchUpIds,
    scheduleTimes,
    venueId,
  };
}
