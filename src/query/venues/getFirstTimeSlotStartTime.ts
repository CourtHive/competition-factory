import { generateTimeSlots } from '@Assemblies/generators/scheduling/generateTimeSlots';
import { getDateTimeBoundary } from '@Generators/scheduling/utils/getTimeBoundary';
import { extractTime, minutesDifference, timeToDate } from '@Tools/dateTime';
import { getCourtDateAvailability } from './getCourtDateAvailability';

export function getFirstTimeSlotStartTime({ averageMinutes, startTime, endTime, courts, date }) {
  // find the first timeSlot across all courts between startTime and endTime that can accommodate averageMatchUpMinutes
  startTime = startTime || getDateTimeBoundary({ courts, scheduleDate: date, startTime: true });
  endTime = endTime || getDateTimeBoundary({ courts, scheduleDate: date, endTime: true });

  let firstTimeSlotStartTime;
  if (startTime && endTime) {
    const dateStartTime = timeToDate(startTime);
    const dateEndTime = timeToDate(endTime);
    for (const court of courts ?? []) {
      if (!Array.isArray(court.dateAvailability)) continue;
      const courtDate = getCourtDateAvailability({ court, date });
      const { timeSlots } = generateTimeSlots({ courtDate });
      timeSlots?.forEach((timeSlot) => {
        const timeSlotStartTime = timeToDate(timeSlot.startTime);
        const timeSlotEndTime = timeToDate(timeSlot.endTime);
        if (timeSlotStartTime > dateEndTime || timeSlotStartTime < dateStartTime) return false;
        if (timeSlotEndTime < dateStartTime) return false;
        const timeSlotMinutes = minutesDifference(timeSlotStartTime, timeSlotEndTime);
        const available = timeSlotMinutes >= averageMinutes;
        if (available) {
          const timeString = extractTime(timeSlotStartTime.toISOString());
          if (timeString && (!firstTimeSlotStartTime || timeString < firstTimeSlotStartTime)) {
            firstTimeSlotStartTime = timeString;
          }
        }
        return undefined;
      });
    }
  }

  return { firstTimeSlotStartTime };
}
