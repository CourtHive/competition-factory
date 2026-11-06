import { generateTimeSlots } from '@Helpers/scheduling/generateTimeSlots';
import { minutesDifference, timeToDate } from '@Tools/dateTime';

export function getEnoughTime({ averageMatchUpMinutes, includeBookingTypes, periodStartTime, periodEndTime }) {
  const enoughTime = (courtDate) => {
    const { timeSlots } = generateTimeSlots({
      includeBookingTypes,
      courtDate,
    });
    const availableTimeSlots = timeSlots?.filter(validTimeSlot);
    return !!availableTimeSlots?.length;
  };

  function validTimeSlot(timeSlot) {
    const slotStartTime = timeToDate(timeSlot.startTime);
    const slotEndTime = timeToDate(timeSlot.endTime);
    if (slotStartTime > periodStartTime) return false;
    if (slotEndTime < periodEndTime) return false;

    const timeSlotMinutes = minutesDifference(periodStartTime, slotEndTime);
    return timeSlotMinutes >= averageMatchUpMinutes;
  }

  return { enoughTime };
}
