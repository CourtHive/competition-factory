import { matchUpFormatTimes, resolveTimingDetails } from '@Query/extensions/matchUpFormatTiming/getMatchUpFormatTiming';
import { calculatePeriodLength } from '@Assemblies/generators/scheduling/utils/calculatePeriodLength';
import { getScheduleTiming } from '@Query/extensions/matchUpFormatTiming/getScheduleTiming';
import { competitionScheduleMatchUps } from '@Query/matchUps/competitionScheduleMatchUps';
import { extractDate, extractTime, sameDay, timeStringMinutes } from '@Tools/dateTime';
import { getVenuesAndCourts } from '@Query/venues/venuesAndCourtsGetter';
import { addDaysToDate, endOnTheDay } from '@Tools/civilDateTime';
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

  const timingOf = ({ eventId, matchUpFormat }: { eventId: string; matchUpFormat?: string }) => {
    const { event, scheduleTiming } = eventDetails[eventId];
    const eventType = event?.eventType;
    const timingDetails = resolveTimingDetails({
      defaultAverageMinutes: averageMatchUpMinutes,
      scheduleTiming,
      defaultRecoveryMinutes,
      matchUpFormat,
    });
    return matchUpFormatTimes({ eventType, timingDetails });
  };

  const bookings = relevantMatchUps.map((matchUp) => {
    const { averageMinutes, recoveryMinutes } = timingOf(matchUp);
    const { courtId, venueId } = matchUp.schedule;
    const startTime = extractTime(matchUp.schedule.scheduledTime);
    // a booking that would end past midnight holds its court to the end of its day (scheduling-pipeline.md § 9.8)
    const { endTime } = endOnTheDay(startTime, averageMinutes);
    return { recoveryMinutes, averageMinutes, periodLength, startTime, endTime, courtId, venueId };
  });

  // a matchUp of the day before that runs past midnight holds its court from 00:00 into this date
  const previousDate = addDaysToDate(extractDate(scheduleDate), -1);
  const previousDateMatchUps = previousDate
    ? competitionScheduleMatchUps({
        matchUpFilters: { ...matchUpFilters, scheduledDate: previousDate },
        sortDateMatchUps: false,
        tournamentRecords,
      })
    : undefined;
  for (const matchUp of [
    ...(previousDateMatchUps?.dateMatchUps ?? []),
    ...(previousDateMatchUps?.completedMatchUps ?? []),
  ]) {
    const { averageMinutes, recoveryMinutes } = timingOf(matchUp);
    const { minutesPastMidnight } = endOnTheDay(extractTime(matchUp.schedule?.scheduledTime), averageMinutes);
    if (!minutesPastMidnight) continue;
    const { courtId, venueId } = matchUp.schedule ?? {};
    const endTime = endOnTheDay('00:00', minutesPastMidnight).endTime;
    bookings.push({ recoveryMinutes, averageMinutes, periodLength, startTime: '00:00', endTime, courtId, venueId });
  }

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
