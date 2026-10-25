import { matchUpFormatTimes, resolveTimingDetails } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import { addDaysToDate, endOnTheDay } from '@Tools/civilDateTime';
import { calculatePeriodLength } from './calculatePeriodLength';
import { extractDate, extractTime } from '@Tools/dateTime';
import { hasSchedule } from '@Query/matchUp/hasSchedule';

// constants and types
import { MISSING_MATCHUPS, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { EventTypeUnion, Tournament } from '@Types/tournamentTypes';
import { BYE } from '@Constants/matchUpStatusConstants';
import { HydratedMatchUp } from '@Types/hydrated';

/** an event as bookings read it: its type, and the scheduling policy timing that applies to it */
export type EventBookingTiming = {
  scheduleTiming?: ReturnType<typeof getScheduleTiming>['scheduleTiming'];
  eventType?: EventTypeUnion;
};
export type EventBookingTimings = { [eventId: string]: EventBookingTiming };

type GenerateBookingsArgs = {
  tournamentRecords?: { [key: string]: Tournament };
  /** the events' timing already resolved (`getEventBookingTimings`): when given, no record is read */
  eventTimings?: EventBookingTimings;
  dateScheduledMatchUps?: HydratedMatchUp[];
  defaultRecoveryMinutes?: number;
  averageMatchUpMinutes?: number;
  matchUps?: HydratedMatchUp[];
  periodLength?: number;
  scheduleDate?: string;
  /** the tournament's only venue, when it has exactly one: a timed matchUp with no venue is booked there */
  soleVenueId?: string;
  venueIds?: string[];
};
export function generateBookings({
  defaultRecoveryMinutes = 0,
  averageMatchUpMinutes = 90,
  dateScheduledMatchUps,
  tournamentRecords,
  eventTimings,
  venueIds = [],
  periodLength,
  scheduleDate,
  soleVenueId,
  matchUps,
}: GenerateBookingsArgs) {
  if (!eventTimings && typeof tournamentRecords !== 'object') return { error: MISSING_TOURNAMENT_RECORDS };

  // a booking reads a matchUp's schedule, never its draw positions: one malformed matchUp must not drop every booking
  if (!Array.isArray(matchUps) && !Array.isArray(dateScheduledMatchUps)) return { error: MISSING_MATCHUPS };

  periodLength =
    periodLength ??
    calculatePeriodLength({
      recoveryMinutes: defaultRecoveryMinutes,
      averageMatchUpMinutes,
    });

  const eventDetails = eventTimings ?? getEventBookingTimings(tournamentRecords ?? {});

  dateScheduledMatchUps ??= matchUps?.filter((matchUp) => {
    const schedule = matchUp.schedule;
    // compare calendar dates: a stored scheduledDate may carry a time component
    // a BYE is never played: it holds no court and no participant, so it is not already scheduled
    return (
      matchUp.matchUpStatus !== BYE &&
      hasSchedule({ schedule }) &&
      (!scheduleDate || extractDate(schedule?.scheduledDate) === extractDate(scheduleDate))
    );
  });

  // a timed matchUp with no venue is at the tournament's only venue, if it has exactly one; otherwise it books no court
  const venueOf = (matchUp: HydratedMatchUp) => matchUp.schedule?.venueId ?? soleVenueId;
  const inVenues = (matchUp: HydratedMatchUp) =>
    (!venueIds.length || venueIds.includes(venueOf(matchUp) ?? '')) && matchUp.matchUpStatus !== BYE;
  const relevantMatchUps = dateScheduledMatchUps?.filter(inVenues);

  const timingOf = ({ eventId, matchUpFormat }: HydratedMatchUp) => {
    const { eventType, scheduleTiming } = eventDetails[eventId];
    // the same minutes the matchUp is timed with (§ 3.3): the record's timing, else the default policy
    const timingDetails = resolveTimingDetails({
      defaultAverageMinutes: averageMatchUpMinutes,
      scheduleTiming,
      defaultRecoveryMinutes,
      matchUpFormat,
    });
    // an event with no type was always read untyped here: the timing falls back to its defaults
    return matchUpFormatTimes({ eventType: eventType as EventTypeUnion, timingDetails });
  };

  const bookings: Booking[] = (relevantMatchUps ?? []).map((matchUp) => {
    const { averageMinutes, recoveryMinutes } = timingOf(matchUp);
    const courtId = matchUp.schedule?.courtId;
    const venueId = venueOf(matchUp);
    const startTime = extractTime(matchUp.schedule?.scheduledTime);
    // a booking that would end past midnight holds its court to the end of its day (scheduling-pipeline.md § 9.8)
    const { endTime } = endOnTheDay(startTime, averageMinutes);
    return { recoveryMinutes, averageMinutes, periodLength, startTime, courtId, endTime, venueId };
  });

  // a matchUp of the day before that runs past midnight holds its court from 00:00 into this date
  const previousDate = scheduleDate && matchUps ? addDaysToDate(extractDate(scheduleDate), -1) : undefined;
  for (const matchUp of previousDate ? (matchUps ?? []) : []) {
    const schedule = matchUp.schedule;
    if (!hasSchedule({ schedule }) || extractDate(schedule?.scheduledDate) !== previousDate || !inVenues(matchUp))
      continue;
    const { averageMinutes, recoveryMinutes } = timingOf(matchUp);
    const { minutesPastMidnight } = endOnTheDay(extractTime(schedule?.scheduledTime), averageMinutes);
    if (!minutesPastMidnight) continue;
    const courtId = schedule?.courtId;
    const venueId = venueOf(matchUp);
    const endTime = endOnTheDay('00:00', minutesPastMidnight).endTime;
    bookings.push({ recoveryMinutes, averageMinutes, periodLength, startTime: '00:00', courtId, endTime, venueId });
  }

  return { bookings, relevantMatchUps, dateScheduledMatchUps };
}

type Booking = {
  recoveryMinutes?: number;
  averageMinutes?: number;
  periodLength?: number;
  startTime?: string;
  courtId?: string;
  endTime: string;
  venueId?: string;
};

/** every event's booking timing, by eventId, across the records */
export function getEventBookingTimings(tournamentRecords: { [key: string]: Tournament }): EventBookingTimings {
  const timings: EventBookingTimings = {};
  for (const tournamentRecord of Object.values(tournamentRecords)) {
    for (const event of tournamentRecord.events ?? []) {
      const { scheduleTiming } = getScheduleTiming({ tournamentRecord, event });
      timings[event.eventId] = { eventType: event.eventType, scheduleTiming };
    }
  }
  return timings;
}
