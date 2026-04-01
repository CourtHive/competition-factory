import { validTimePeriod } from './time';
import { dateValidation, timeValidation } from './regex';

import {
  INVALID_DATE,
  INVALID_TIME,
  INVALID_BOOKINGS,
  INVALID_DATE_AVAILABILITY,
  MISSING_DATE_AVAILABILITY,
} from '@Constants/errorConditionConstants';

export function validDateAvailability({ dateAvailability }) {
  if (!dateAvailability) return { error: MISSING_DATE_AVAILABILITY };
  if (!Array.isArray(dateAvailability)) return { error: INVALID_DATE_AVAILABILITY };

  for (const availability of dateAvailability) {
    if (typeof availability !== 'object') {
      return { error: INVALID_DATE_AVAILABILITY };
    }

    const { date, startTime, endTime, bookings = [] } = availability;
    if (!startTime || !endTime) {
      return { error: INVALID_DATE_AVAILABILITY };
    }

    const dateError = validateDate(date);
    if (dateError) return dateError;

    const timeError = validateTimePair(startTime, endTime);
    if (timeError) return timeError;

    if (bookings) {
      const bookingsError = validateBookings(bookings);
      if (bookingsError) return bookingsError;
    }
  }

  return { valid: true };
}

const DATE_NOTE = 'Dates must be formated => YYYY-MM-DD';
const TIME_NOTE = 'Times must be 24 hour => 00:00';

function validateDate(date) {
  if (date && !dateValidation.test(date)) {
    return {
      error: INVALID_DATE,
      dateAvailability: { date },
      info: DATE_NOTE,
    };
  }
  return undefined;
}

function validateTimePair(startTime, endTime) {
  if (!timeValidation.test(startTime)) {
    return {
      error: INVALID_TIME,
      dateAvailability: { startTime },
      info: TIME_NOTE,
    };
  }
  if (!timeValidation.test(endTime)) {
    return {
      error: INVALID_TIME,
      dateAvailability: { endTime },
      info: TIME_NOTE,
    };
  }
  if (startTime === endTime) {
    return {
      error: INVALID_TIME,
      dateAvailability: { startTime, endTime },
      info: 'startTime and endTime are equivalent',
    };
  }
  if (!validTimePeriod({ startTime, endTime })) {
    return {
      error: INVALID_TIME,
      dateAvailability: { startTime, endTime },
      info: 'endTime must be after startTime',
    };
  }
  return undefined;
}

function validateBookings(bookings) {
  if (!Array.isArray(bookings)) {
    return { error: INVALID_BOOKINGS };
  }

  for (const booking of bookings) {
    if (typeof booking !== 'object') {
      return { error: INVALID_BOOKINGS };
    }
    const { startTime, endTime } = booking;
    const timeError = validateTimePair(startTime, endTime);
    if (timeError) return timeError;
  }

  return undefined;
}
