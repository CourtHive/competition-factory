import { canonicalDate, canonicalTime } from '@Tools/canonicalClock';
import { validTimePeriod } from './time';

// constants and types
import { Availability, Booking } from '@Types/tournamentTypes';
import {
  INVALID_DATE,
  INVALID_TIME,
  INVALID_BOOKINGS,
  INVALID_DATE_AVAILABILITY,
  MISSING_DATE_AVAILABILITY,
} from '@Constants/errorConditionConstants';

/**
 * Every date is a calendar day and every time a wall-clock time (scheduling-pipeline.md § 9.9). A valid result carries
 * the availability in canonical form, `canonicalAvailability`, `YYYY-MM-DD` and `HH:MM`, which is what a writer stores.
 * Validates untrusted input, so it accepts anything and checks the shape itself.
 */
export function validDateAvailability({ dateAvailability }: { dateAvailability?: unknown }) {
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

  return { valid: true, canonicalAvailability: dateAvailability.map(canonicalAvailability) };
}

function canonicalAvailability(availability: Availability): Availability {
  const canonical: Availability = {
    ...availability,
    startTime: canonicalTime(availability.startTime),
    endTime: canonicalTime(availability.endTime),
  };
  if (availability.date) canonical.date = canonicalDate(availability.date);
  if (Array.isArray(availability.bookings)) {
    canonical.bookings = availability.bookings.map((booking: Booking) => ({
      ...booking,
      startTime: canonicalTime(booking.startTime),
      endTime: canonicalTime(booking.endTime),
    }));
  }
  return canonical;
}

const DATE_NOTE = 'Dates must be formated => YYYY-MM-DD';
const TIME_NOTE = 'Times must be 24 hour => 00:00';

function validateDate(date) {
  if (date && !canonicalDate(date)) {
    return {
      error: INVALID_DATE,
      dateAvailability: { date },
      info: DATE_NOTE,
    };
  }
  return undefined;
}

function validateTimePair(startTime, endTime) {
  if (!canonicalTime(startTime)) {
    return {
      error: INVALID_TIME,
      dateAvailability: { startTime },
      info: TIME_NOTE,
    };
  }
  if (!canonicalTime(endTime)) {
    return {
      error: INVALID_TIME,
      dateAvailability: { endTime },
      info: TIME_NOTE,
    };
  }
  if (canonicalTime(startTime) === canonicalTime(endTime)) {
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
