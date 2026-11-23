import { getCourtDateAvailability } from '@Helpers/scheduling/getCourtDateAvailability';
import { timeStringMinutes } from '@Tools/dateTime';
import { Court } from '@Types/tournamentTypes';

type GetTimeBoundaryArgs = {
  scheduleDate: string;
  startTime?: boolean;
  endTime?: boolean;
  courts: Court[];
};
export function getDateTimeBoundary({ scheduleDate, startTime, endTime, courts }: GetTimeBoundaryArgs) {
  const accessor = (startTime && 'startTime') || (endTime && 'endTime') || undefined;
  return courts.reduce((boundaryTime, court) => {
    const dateAvailability = getCourtDateAvailability({
      date: scheduleDate,
      court,
    });

    const comparisonTime = accessor && (dateAvailability?.[accessor] || court[accessor]);

    return comparisonTime &&
      (!boundaryTime ||
        (startTime && timeStringMinutes(comparisonTime) < timeStringMinutes(boundaryTime)) ||
        (endTime && timeStringMinutes(comparisonTime) > timeStringMinutes(boundaryTime)))
      ? comparisonTime
      : boundaryTime;
  }, undefined);
}

export function getCourtsTimeBoundary({ startTime, endTime, courts }) {
  return courts.reduce((boundaryTime, court) => {
    const comparisonTime = getCourtTimeBoundary({ startTime, endTime, court });
    return comparisonTime &&
      (!boundaryTime ||
        (startTime && timeStringMinutes(comparisonTime) < timeStringMinutes(boundaryTime)) ||
        (endTime && timeStringMinutes(comparisonTime) > timeStringMinutes(boundaryTime)))
      ? comparisonTime
      : boundaryTime;
  }, undefined);
}

export function getCourtTimeBoundary({ startTime, endTime, court }) {
  const accessor = (startTime && 'startTime') || (endTime && 'endTime') || undefined;
  return court.dateAvailability?.reduce((boundary, availability) => {
    const candidate = availability?.[accessor];

    if (!candidate) return boundary;
    if (!boundary) return candidate;

    if (startTime) {
      if (timeStringMinutes(candidate) < timeStringMinutes(boundary)) boundary = candidate;
    } else if (timeStringMinutes(boundary) > timeStringMinutes(candidate)) {
      boundary = candidate;
    }

    return boundary;
  }, undefined);
}
