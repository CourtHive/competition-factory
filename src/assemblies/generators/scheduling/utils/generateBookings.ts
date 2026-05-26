import { matchUpFormatTimes } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import { addMinutesToTimeString, extractTime } from '@Tools/dateTime';
import { calculatePeriodLength } from './calculatePeriodLength';
import { validMatchUps } from '@Validators/validMatchUp';
import { hasSchedule } from '@Query/matchUp/hasSchedule';

// constants and types
import { MISSING_MATCHUPS, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { BYE } from '@Constants/matchUpStatusConstants';
import { Tournament } from '@Types/tournamentTypes';
import { HydratedMatchUp } from '@Types/hydrated';

type GenerateBookingsArgs = {
  tournamentRecords: { [key: string]: Tournament };
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
  venueIds = [],
  periodLength,
  scheduleDate,
  matchUps,
}: GenerateBookingsArgs) {
  if (typeof tournamentRecords !== 'object') return { error: MISSING_TOURNAMENT_RECORDS };

  if (!validMatchUps(matchUps) && !Array.isArray(dateScheduledMatchUps)) return { error: MISSING_MATCHUPS };

  periodLength =
    periodLength ??
    calculatePeriodLength({
      recoveryMinutes: defaultRecoveryMinutes,
      averageMatchUpMinutes,
    });

  // get a mapping of eventIds to category details
  const eventDetails = Object.assign(
    {},
    ...Object.values(tournamentRecords).flatMap((tournamentRecord) =>
      (tournamentRecord.events ?? []).map((event) => {
        const { scheduleTiming } = getScheduleTiming({
          tournamentRecord,
          event,
        });

        return {
          [event.eventId]: { event, scheduleTiming },
        };
      }),
    ),
  );

  const defaultTiming = {
    averageTimes: [{ minutes: { default: averageMatchUpMinutes } }],
    recoveryTimes: [{ minutes: { default: defaultRecoveryMinutes } }],
  };

  dateScheduledMatchUps ??= matchUps?.filter((matchUp) => {
    const schedule = matchUp.schedule;
    return hasSchedule({ schedule }) && (!scheduleDate || schedule?.scheduledDate === scheduleDate);
  });

  const relevantMatchUps = dateScheduledMatchUps?.filter(
    (matchUp) =>
      (!venueIds.length || venueIds.includes(matchUp.schedule?.venueId ?? '')) && matchUp.matchUpStatus !== BYE,
  );

  const bookings = relevantMatchUps
    ?.map(({ eventId, schedule, matchUpFormat }) => {
      const { event, scheduleTiming } = eventDetails[eventId];
      const eventType = event?.eventType;
      const timingDetails = {
        ...scheduleTiming,
        defaultTiming,
        matchUpFormat,
      };
      const { averageMinutes, recoveryMinutes } = matchUpFormatTimes({
        timingDetails,
        eventType,
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
