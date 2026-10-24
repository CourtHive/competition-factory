import { matchUpFormatTimes } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import { addMinutesToTimeString, extractDate, extractTime } from '@Tools/dateTime';
import { calculatePeriodLength } from './calculatePeriodLength';
import { hasSchedule } from '@Query/matchUp/hasSchedule';
import { validMatchUps } from '@Validators/validMatchUp';

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
  matchUps,
}: GenerateBookingsArgs) {
  if (!eventTimings && typeof tournamentRecords !== 'object') return { error: MISSING_TOURNAMENT_RECORDS };

  if (!validMatchUps(matchUps) && !Array.isArray(dateScheduledMatchUps)) return { error: MISSING_MATCHUPS };

  periodLength =
    periodLength ??
    calculatePeriodLength({
      recoveryMinutes: defaultRecoveryMinutes,
      averageMatchUpMinutes,
    });

  const eventDetails = eventTimings ?? getEventBookingTimings(tournamentRecords ?? {});

  const defaultTiming = {
    averageTimes: [{ minutes: { default: averageMatchUpMinutes } }],
    recoveryTimes: [{ minutes: { default: defaultRecoveryMinutes } }],
  };

  dateScheduledMatchUps ??= matchUps?.filter((matchUp) => {
    const schedule = matchUp.schedule;
    // compare calendar dates: a stored scheduledDate may carry a time component
    return (
      hasSchedule({ schedule }) && (!scheduleDate || extractDate(schedule?.scheduledDate) === extractDate(scheduleDate))
    );
  });

  const relevantMatchUps = dateScheduledMatchUps?.filter(
    (matchUp) =>
      (!venueIds.length || venueIds.includes(matchUp.schedule?.venueId ?? '')) && matchUp.matchUpStatus !== BYE,
  );

  const bookings = relevantMatchUps
    ?.map(({ eventId, schedule, matchUpFormat }) => {
      const { eventType, scheduleTiming } = eventDetails[eventId];
      const timingDetails = {
        ...scheduleTiming,
        defaultTiming,
        matchUpFormat,
      };
      // an event with no type was always read untyped here: the timing falls back to its defaults
      const { averageMinutes, recoveryMinutes } = matchUpFormatTimes({
        eventType: eventType as EventTypeUnion,
        timingDetails,
      });
      const { courtId, venueId } = schedule ?? {};
      const startTime = extractTime(schedule?.scheduledTime);
      const endTime = addMinutesToTimeString(startTime, averageMinutes);
      return {
        recoveryMinutes,
        averageMinutes,
        periodLength,
        startTime,
        courtId,
        endTime,
        venueId,
      };
    })
    .filter(Boolean);

  return { bookings, relevantMatchUps, dateScheduledMatchUps };
}

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
