import { checkRequiredParameters } from '@Helpers/parameters/checkRequiredParameters';
import { timeToDate, extractTime, tidyTime } from '@Tools/dateTime';

import { OBJECT } from '@Constants/attributeConstants';
import { ResultType } from '@Types/factoryTypes';

type GenerateTimeSlotsArgs = {
  includeBookingTypes?: string[];
  courtDate: any;
};

export function generateTimeSlots(params: GenerateTimeSlotsArgs): ResultType & { timeSlots?: any[] } {
  const paramsCheck = checkRequiredParameters(params, [{ courtDate: true, _ofType: OBJECT }]);
  if (paramsCheck.error) return paramsCheck;

  const { includeBookingTypes = [], courtDate } = params;

  const timeSlots: any[] = [];
  let startTime = timeToDate(courtDate.startTime);

  (courtDate.bookings ?? [])
    .filter((booking) => !booking.bookingType || !includeBookingTypes.includes(booking.bookingType))
    .sort((a, b) => (tidyTime(a.startTime) || '').localeCompare(tidyTime(b.startTime) || ''))
    .forEach((booking) => {
      const timeSlot = {
        startTime: extractTime(startTime.toISOString()),
        endTime: booking.startTime,
      };
      if (timeToDate(booking.startTime) > startTime) {
        timeSlots.push(timeSlot);
      }
      if (timeToDate(booking.endTime) > startTime) {
        startTime = timeToDate(booking.endTime);
      }
    });

  const timeSlot = {
    startTime: extractTime(startTime.toISOString()),
    endTime: courtDate.endTime,
  };
  if (timeToDate(courtDate.endTime) > startTime) {
    timeSlots.push(timeSlot);
  }

  return { timeSlots };
}
