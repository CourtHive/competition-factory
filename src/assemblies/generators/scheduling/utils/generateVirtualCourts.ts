import { generateTimeSlots } from '@Assemblies/generators/scheduling/generateTimeSlots';
import { getCourtDateAvailability } from '@Query/venues/getCourtDateAvailability';
import { isValidDateString, timeStringMinutes } from '@Tools/dateTime';
import { makeDeepCopy } from '@Tools/makeDeepCopy';

// constants
import { INVALID_BOOKINGS, INVALID_DATE, INVALID_VALUES } from '@Constants/errorConditionConstants';

export function generateVirtualCourts(params) {
  const { remainingScheduleTimes = [], clearScheduleDates, periodLength = 30, scheduleDate, courts = [] } = params;
  let { bookings = [] } = params;

  if (!Array.isArray(courts) || !courts.length) return { error: INVALID_VALUES, courts };
  if (!Array.isArray(bookings)) return { error: INVALID_BOOKINGS };
  if (!isValidDateString(scheduleDate)) return { error: INVALID_DATE };

  if (clearScheduleDates) {
    if (Array.isArray(clearScheduleDates)) {
      if (clearScheduleDates.includes(scheduleDate)) bookings = [];
    } else {
      bookings = [];
    }
  }

  const { courtBookings, unassignedBookings } = bookings.reduce(
    (accumulator: any, booking) => {
      const { courtId } = booking;
      if (courtId) {
        if (accumulator.courtBookings[courtId]) {
          accumulator.courtBookings[courtId].push(booking);
        } else {
          accumulator.courtBookings[courtId] = [booking];
        }
      } else {
        accumulator.unassignedBookings.push(booking);
      }
      return accumulator;
    },
    { courtBookings: {}, unassignedBookings: [] },
  );

  const inProcessCourts = courts.map((court, index) => {
    const { courtId, courtName } = court;
    const bookingsThisCourt = courtBookings[courtId] ?? [];
    const availability = getCourtDateAvailability({ date: scheduleDate, court }) ?? {};
    const { bookings: existingBookings = [], startTime, endTime, date } = availability;

    const allocatedTimeBooking = remainingScheduleTimes[index] && {
      startTime,
      endTime: remainingScheduleTimes[index],
    };

    const amendedBookings = [
      allocatedTimeBooking,
      ...makeDeepCopy(existingBookings, false, true),
      ...bookingsThisCourt,
    ].filter(Boolean);

    return {
      courtId,
      courtName,
      dateAvailability: {
        bookings: amendedBookings,
        startTime,
        endTime,
        date,
      },
    };
  });

  unassignedBookings.sort((a, b) => timeStringMinutes(a.startTime) - timeStringMinutes(b.startTime));

  const getCourtTimeSlots = () =>
    inProcessCourts.flatMap((court) => {
      const courtDate = court.dateAvailability;
      const { timeSlots = [] } = generateTimeSlots({ courtDate });
      return {
        courtName: court.courtName,
        courtId: court.courtId,
        timeSlots,
      };
    });

  const assignedBookings: any[] = [];

  for (const unassignedBooking of unassignedBookings) {
    const { startTime, endTime, averageMinutes, recoveryMinutes, matchUpId } = unassignedBooking;
    const startMinutes = timeStringMinutes(startTime);
    const endMinutes = timeStringMinutes(endTime);
    const courtTimeSlots = getCourtTimeSlots();
    const bestCourt = courtTimeSlots.reduce((best: any, { courtId, courtName, timeSlots }) => {
      let startDifference;
      const timeSlot = timeSlots.find(({ startTime, endTime }) => {
        startDifference = timeStringMinutes(startTime) - startMinutes;
        const startFits = startMinutes >= timeStringMinutes(startTime);
        const endFits = endMinutes <= timeStringMinutes(endTime);
        return (
          endFits &&
          best.startDifference !== 0 &&
          (((startDifference === 0 || startDifference + periodLength >= 0) &&
            (best.startDifference === undefined || startDifference < best.startDifference)) ||
            startFits)
        );
      });
      return timeSlot ? { courtName, courtId, startDifference } : best;
    }, {});

    if (bestCourt.courtId) {
      const booking = {
        averageMinutes,
        recoveryMinutes,
        matchUpId,
        startTime,
        endTime,
      };
      assignedBookings.push(booking);
      const virtualCourt = inProcessCourts.find(({ courtId }) => courtId === bestCourt.courtId);
      virtualCourt?.dateAvailability.bookings.push(booking);
    } else {
      console.log({ unassignedBooking });
    }
  }

  const virtualCourts: any[] = inProcessCourts.map(({ courtId, courtName, dateAvailability }) => ({
    dateAvailability: [dateAvailability],
    courtName,
    courtId,
  }));

  return { virtualCourts, assignedBookings };
}
