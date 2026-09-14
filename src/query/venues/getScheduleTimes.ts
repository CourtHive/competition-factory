import { getUTCdateString, extractTime, extractDate, timeStringMinutes, dayMinutesToTimeString } from '@Tools/dateTime';
import { calculatePeriodLength } from '@Generators/scheduling/utils/calculatePeriodLength';
import { generateVirtualCourts } from '@Generators/scheduling/utils/generateVirtualCourts';
import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { getCourtsAvailableAtPeriodStart } from './getCourtsAvailableAtPeriodStart';
import { courtGenerator } from '@Assemblies/generators/scheduling/courtGenerator';
import { getFirstTimeSlotStartTime } from './getFirstTimeSlotStartTime';
import { generateRange } from '@Tools/arrays';
import { ensureInt } from '@Tools/ensureInt';

// constants and types
import { ScheduleTimesResult, ResultType } from '@Types/factoryTypes';
import { ARRAY } from '@Constants/attributeConstants';

export function getScheduleTimes(params): ResultType & {
  scheduleTimes?: ScheduleTimesResult[];
  totalMatchUps?: number;
  timingProfile?: any;
} {
  const paramsCheck = checkRequiredParameters(params, [{ courts: true, _ofType: ARRAY }]);
  if (paramsCheck.error) return paramsCheck;

  let { date = getUTCdateString(), startTime = '08:00', endTime = '19:00', periodLength, courts } = params;

  const {
    calculateStartTimeFromCourts = true,
    remainingScheduleTimes, // times remaining from previous scheduling iteration
    averageMatchUpMinutes,
    clearScheduleDates,
    courtsCount,
    bookings,
  } = params;

  periodLength = periodLength || calculatePeriodLength({ averageMatchUpMinutes });

  // standardize date as YYYY-MM-DD
  date = extractDate(date);

  // standardize time as 00:00
  startTime = extractTime(startTime);
  endTime = extractTime(endTime);

  // keeps track of value of calculation after previous iteration
  let previousCalculation = 0;

  // keeps track of # of courts available during previous iteration
  let previousAvailableCourts = 0;

  // cumulativeMatches (float) number of matchUps possible for averageCourts
  // over # of periods of length periodLength
  let cumulativeMatches = 0;

  // accumulated matchUps which have been scheduled
  let totalMatchUps = 0;

  // accumulated time periods when a court was available for scheduling
  let cumulativePeriods = 0;

  if (!courts && courtsCount) {
    courts = courtGenerator({ startTime, endTime, count: courtsCount, date });
  }

  const { virtualCourts } = generateVirtualCourts({
    remainingScheduleTimes,
    clearScheduleDates,
    scheduleDate: date,
    periodLength,
    bookings,
    courts,
  });

  const { firstTimeSlotStartTime } = getFirstTimeSlotStartTime({
    averageMinutes: averageMatchUpMinutes,
    courts: virtualCourts,
    startTime,
    endTime,
    date,
  });

  if (calculateStartTimeFromCourts && firstTimeSlotStartTime) {
    startTime = firstTimeSlotStartTime ?? startTime;
  }

  // startTime, endTime and periodLength are used to calculate periodCount
  const dayStartMinutes = timeStringMinutes(startTime);
  const dayEndMinutes = timeStringMinutes(endTime);
  const dayMinutes = dayEndMinutes - dayStartMinutes;
  const periodCount = Math.floor(dayMinutes / periodLength);
  const periods = generateRange(0, periodCount + 1);

  const timingProfile = periods.map((period) => {
    const periodStartMinutes = dayStartMinutes + period * periodLength;
    const periodStart = dayMinutesToTimeString(periodStartMinutes);

    // availableToScheduleCount calculated from periodStartTime and averageMatchUpMinutes
    // a court is only available if it can accommodate matchUps of duration averageMatchUpMinutes
    const availableResult = getCourtsAvailableAtPeriodStart({
      courts: virtualCourts ?? [],
      averageMatchUpMinutes,
      periodStart,
      date,
    });
    if (availableResult.error) return { error: availableResult.error };
    const { availableToScheduleCount = 0 } = availableResult;

    // newCourts are courts which have become available for the start of current time period
    const newCourts =
      availableToScheduleCount > previousAvailableCourts ? availableToScheduleCount - previousAvailableCourts : 0;

    cumulativePeriods += period ? availableToScheduleCount : 0;
    const averageCourts = period ? cumulativePeriods / period : availableToScheduleCount;

    // calculatedTotal uses Revised Garman Formula to calculate total number of matchUps
    // which should be possible given a number of periods and an average number of courts
    // available over the accumulated time
    const accumulatedTime = periodLength * averageCourts;
    const matchesCalculation = accumulatedTime / averageMatchUpMinutes;
    const calculatedTotal = period ? matchesCalculation * (period - 1) + averageCourts : averageCourts;

    // used to increment cumulativeMatches
    // difference between current calculation and previous calculation
    // if no available courts then Zero so that cumulativeMatches does not increase
    // if available courts but no previously available courts then newCourts;
    const calculationDifference = !availableToScheduleCount
      ? 0
      : (previousAvailableCourts && calculatedTotal - previousCalculation) || newCourts;

    previousCalculation = calculatedTotal;
    previousAvailableCourts = availableToScheduleCount;
    cumulativeMatches += calculationDifference;

    const addToSchedule = ensureInt(cumulativeMatches) - totalMatchUps;
    totalMatchUps += addToSchedule;

    return {
      periodStart,
      add: addToSchedule,
      availableToScheduleCount,
      newCourts,
      totalMatchUps,
    };
  });

  const scheduleTimes = timingProfile
    .reduce((scheduleTimes, profile) => {
      const stRange: number[] = generateRange(0, profile.add);
      const newTimes: any[] = stRange.map(() => {
        const scheduleTime = profile.periodStart;
        return { scheduleTime };
      });
      return scheduleTimes.concat(...newTimes);
    }, [])
    .flat();

  return { scheduleTimes, timingProfile, totalMatchUps };
}
