import { getCourtDateAvailability } from '@Query/venues/getCourtDateAvailability';
import { findCourt } from '@Query/venues/findCourt';

// constants and types
import { BOOKING_NOT_FOUND, COURT_NOT_FOUND, ErrorType } from '@Constants/errorConditionConstants';
import { Availability, Booking, Court, Tournament, Venue } from '@Types/tournamentTypes';
import { PRACTICE } from '@Constants/scheduleConstants';

type FindPracticeBookingArgs = {
  tournamentRecord: Tournament;
  courtId: string;
  date: string;
  bookingId: string;
};

type FindPracticeBookingResult = {
  availability?: Availability;
  booking?: Booking;
  court?: Court;
  error?: ErrorType;
  venue?: Venue;
};

/**
 * Resolves a PRACTICE booking by id with deterministic fallback for legacy
 * bookings that predate the bookingId field. The fallback id is
 * `${courtId}-${date}-${startTime}` — stable for a given (court, date, slot).
 *
 * Side effect: stamps `booking.bookingId` on hit when the booking lacks one,
 * promoting legacy bookings to the new addressing scheme on first touch.
 */
export function findPracticeBooking({
  tournamentRecord,
  courtId,
  date,
  bookingId,
}: FindPracticeBookingArgs): FindPracticeBookingResult {
  const courtResult = findCourt({ tournamentRecord, courtId });
  if (courtResult.error) return courtResult;
  const { court, venue } = courtResult;
  if (!court) return { error: COURT_NOT_FOUND };

  const availability = getCourtDateAvailability({ court, date });
  if (!availability?.bookings?.length) return { error: BOOKING_NOT_FOUND };

  const booking = availability.bookings.find((b) => {
    if (b.bookingType !== PRACTICE) return false;
    if (b.bookingId === bookingId) return true;
    const derivedId = deriveBookingId({ courtId, date, startTime: b.startTime });
    return derivedId === bookingId;
  });

  if (!booking) return { error: BOOKING_NOT_FOUND };

  booking.bookingId ??= bookingId;

  return { court, venue, availability, booking };
}

export function deriveBookingId({
  courtId,
  date,
  startTime,
}: {
  courtId: string;
  date?: string;
  startTime?: string;
}): string {
  return `${courtId}-${date ?? ''}-${startTime ?? ''}`;
}
