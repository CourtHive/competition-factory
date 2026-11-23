import { Availability, Booking, Venue } from '@Types/tournamentTypes';

type InContextCourt = {
  dateAvailability?: Availability[];
  venueId: string;
  [key: string]: any;
};

type ApplyVenueConstraintsArgs = {
  inContextCourt: InContextCourt;
  venue: Venue;
};

export function applyVenueConstraints({ inContextCourt, venue }: ApplyVenueConstraintsArgs) {
  const { defaultStartTime, defaultEndTime, dateAvailability: venueDateAvailability } = venue;

  const hasVenueSchedulingAttrs = defaultStartTime || defaultEndTime || venueDateAvailability?.length;
  if (!hasVenueSchedulingAttrs) return;

  const courtDateAvailability = inContextCourt.dateAvailability;

  if (!courtDateAvailability?.length) {
    // Court has no dateAvailability: inherit from venue
    if (venueDateAvailability?.length) {
      inContextCourt.dateAvailability = venueDateAvailability.map((va) => ({ ...va }));
    } else if (defaultStartTime && defaultEndTime) {
      inContextCourt.dateAvailability = [{ startTime: defaultStartTime, endTime: defaultEndTime }];
    }
    return;
  }

  // Court HAS dateAvailability: intersect with venue constraints
  inContextCourt.dateAvailability = courtDateAvailability.map((courtAvail) => {
    const venueAvail = getVenueAvailabilityForDate({
      date: courtAvail.date,
      venueDateAvailability,
      defaultStartTime,
      defaultEndTime,
    });

    if (!venueAvail) return courtAvail;

    const effectiveStart = laterTime(courtAvail.startTime, venueAvail.startTime);
    const effectiveEnd = earlierTime(courtAvail.endTime, venueAvail.endTime);

    const mergedBookings = mergeBookings(courtAvail.bookings, venueAvail.bookings);

    return {
      ...courtAvail,
      startTime: effectiveStart,
      endTime: effectiveEnd,
      ...(mergedBookings.length ? { bookings: mergedBookings } : {}),
    };
  });
}

/**
 * Venue availability lookup precedence:
 * 1. Date-specific entry in venueDateAvailability
 * 2. Dateless default entry in venueDateAvailability
 * 3. defaultStartTime/defaultEndTime
 */
function getVenueAvailabilityForDate({
  date,
  venueDateAvailability,
  defaultStartTime,
  defaultEndTime,
}: {
  date?: string;
  venueDateAvailability?: Availability[];
  defaultStartTime?: string;
  defaultEndTime?: string;
}): { startTime?: string; endTime?: string; bookings?: Booking[] } | undefined {
  if (venueDateAvailability?.length) {
    // Look for date-specific match
    if (date) {
      const dateMatch = venueDateAvailability.find((va) => va.date === date);
      if (dateMatch) return dateMatch;
    }

    // Look for dateless default
    const datelessDefault = venueDateAvailability.find((va) => !va.date);
    if (datelessDefault) return datelessDefault;
  }

  // Fall back to venue defaults
  if (defaultStartTime || defaultEndTime) {
    return { startTime: defaultStartTime, endTime: defaultEndTime };
  }

  return undefined;
}

function laterTime(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a > b ? a : b;
}

function earlierTime(a?: string, b?: string): string | undefined {
  if (!a) return b;
  if (!b) return a;
  return a < b ? a : b;
}

function mergeBookings(courtBookings?: Booking[], venueBookings?: Booking[]): Booking[] {
  const result: Booking[] = [];
  if (courtBookings?.length) result.push(...courtBookings);
  if (venueBookings?.length) result.push(...venueBookings);
  return result;
}
