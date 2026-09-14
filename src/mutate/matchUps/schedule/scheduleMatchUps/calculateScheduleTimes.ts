import { calculatePeriodLength } from '@Assemblies/generators/scheduling/utils/calculatePeriodLength';
import { matchUpFormatTimes } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { addMinutesToTimeString, extractTime, sameDay, timeStringMinutes } from '@Tools/dateTime';
import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import { competitionScheduleMatchUps } from '@Query/matchUps/competitionScheduleMatchUps';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { getScheduleTimes } from '@Query/venues/getScheduleTimes';
import { getMatchUpId } from '@Functions/global/extractors';

// constants and types
import { ErrorType, MISSING_TOURNAMENT_RECORDS } from '@Constants/errorConditionConstants';
import { Tournament } from '@Types/tournamentTypes';

type CalculateScheduleTimesArgs = {
  tournamentRecords: { [key: string]: Tournament };
  calculateStartTimeFromCourts?: boolean;
  remainingScheduleTimes?: string[];
  defaultRecoveryMinutes?: number;
  averageMatchUpMinutes?: number;
  clearScheduleDates?: boolean;
  periodLength?: number;
  scheduleDate: string;
  venueIds?: string[];
  startTime?: string;
  endTime?: string;
};
export function calculateScheduleTimes({
  calculateStartTimeFromCourts = true,
  defaultRecoveryMinutes = 0,
  averageMatchUpMinutes = 90,
  remainingScheduleTimes,
  clearScheduleDates,
  tournamentRecords,
  periodLength,
  scheduleDate,
  startTime,
  venueIds,
  endTime,
}: CalculateScheduleTimesArgs): {
  dateScheduledMatchUpIds?: string[];
  totalMatchUps?: number;
  scheduleTimes?: any[];
  timingProfile?: any;
  error?: ErrorType;
  venueId?: string;
} {
  if (typeof tournamentRecords !== 'object' || !Object.keys(tournamentRecords).length)
    return { error: MISSING_TOURNAMENT_RECORDS };

  periodLength =
    periodLength ??
    calculatePeriodLength({
      recoveryMinutes: defaultRecoveryMinutes,
      averageMatchUpMinutes,
    });

  const { courts: allCourts, venues } = getVenuesAndCourts({
    dates: [scheduleDate],
    ignoreDisabled: true,
    tournamentRecords,
  });

  const courts = allCourts?.filter((court) => !venueIds || venueIds.includes(court.venueId));

  if (!startTime) {
    startTime = courts?.reduce((minStartTime, court) => {
      const dateAvailability = court.dateAvailability?.find(
        // if no date is specified consider it to be default for all tournament dates
        (availability) => !availability.date || sameDay(scheduleDate, availability.date),
      );
      const comparisonStartTime = dateAvailability?.startTime ?? court.startTime;

      return comparisonStartTime &&
        (!minStartTime || timeStringMinutes(comparisonStartTime) < timeStringMinutes(minStartTime))
        ? comparisonStartTime
        : minStartTime;
    }, undefined);
  }

  if (!endTime) {
    endTime = courts?.reduce((maxEndTime, court) => {
      const dateAvailability = court.dateAvailability?.find(
        // if no date is specified consider it to be default for all tournament dates
        (availability) => !availability.date || sameDay(scheduleDate, availability.date),
      );
      const comparisonEndTime = dateAvailability?.endTime ?? court.endTime;

      return comparisonEndTime && (!maxEndTime || timeStringMinutes(comparisonEndTime) > timeStringMinutes(maxEndTime))
        ? comparisonEndTime
        : maxEndTime;
    }, undefined);
  }

  // get a mapping of eventIds to category details
  const tournaments = Object.values(tournamentRecords);
  const eventDetails = Object.assign(
    {},
    ...tournaments
      .map((tournamentRecord) =>
        (tournamentRecord.events ?? []).map((event) => {
          const { scheduleTiming } = getScheduleTiming({
            tournamentRecord,
            event,
          });

          return {
            [event.eventId]: { event, scheduleTiming },
          };
        }),
      )
      .flat(),
  );

  // Get an array of all matchUps scheduled for the date
  // some of them may have courts assigned and some may only have venueIds
  // need to reduce courts available for a given time period by the number of matchUps scheduled at a given venue
  const matchUpFilters = { scheduledDate: scheduleDate, venueIds };
  const matchUpsWithSchedule = competitionScheduleMatchUps({
    sortDateMatchUps: false, // unnecessary for extracting bookings; reduce processing overhead;
    tournamentRecords,
    matchUpFilters,
  });
  const dateMatchUps = matchUpsWithSchedule?.dateMatchUps ?? [];
  const completedMatchUps = matchUpsWithSchedule?.completedMatchUps ?? [];

  const relevantMatchUps: any[] = [];
  relevantMatchUps.push(...dateMatchUps);
  relevantMatchUps.push(...completedMatchUps);

  const defaultTiming = {
    averageTimes: [{ minutes: { default: averageMatchUpMinutes } }],
    recoveryTimes: [{ minutes: { default: defaultRecoveryMinutes } }],
  };

  const bookings = relevantMatchUps?.map(({ eventId, schedule, matchUpFormat }) => {
    const { event, scheduleTiming } = eventDetails[eventId];
    const eventType = event?.eventType;
    const timingDetails = {
      ...scheduleTiming,
      defaultTiming,
      matchUpFormat,
    };
    const { averageMinutes, recoveryMinutes } = matchUpFormatTimes({
      eventType,
      timingDetails,
    });
    const { courtId, venueId } = schedule;
    const startTime = extractTime(schedule.scheduledTime);
    const endTime = addMinutesToTimeString(startTime, averageMinutes);
    return {
      recoveryMinutes,
      averageMinutes,
      periodLength,
      startTime,
      endTime,
      courtId,
      venueId,
    };
  });

  const timingParameters = {
    calculateStartTimeFromCourts,
    remainingScheduleTimes,
    averageMatchUpMinutes,
    date: scheduleDate,
    clearScheduleDates,
    periodLength,
    startTime,
    endTime,
    bookings,
    courts,
  };
  const { scheduleTimes } = getScheduleTimes(timingParameters);

  // if a single venue specified, or only one venue available, return venueId
  const venueId = (venueIds?.length === 1 && venueIds[0]) || (venues?.length === 1 && venues[0].venueId) || undefined;

  const dateScheduledMatchUpIds = relevantMatchUps.map(getMatchUpId);

  return { venueId, scheduleTimes, dateScheduledMatchUpIds };
}
