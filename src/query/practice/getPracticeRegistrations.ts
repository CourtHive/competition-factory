import { deriveBookingId } from '@Mutate/practice/findPracticeBooking';
import { sameDay } from '@Tools/dateTime';

// constants and types
import { PracticeRegistration, Tournament } from '@Types/tournamentTypes';
import { PRACTICE } from '@Constants/scheduleConstants';

export type PracticeRegistrationRecord = {
  registration: PracticeRegistration;
  courtId: string;
  venueId: string;
  date: string;
  bookingId: string;
  bookingStartTime?: string;
  bookingEndTime?: string;
};

type RegistrationFilter = {
  courtId?: string;
  date?: string;
  participantId?: string;
  includeCancelled?: boolean;
};

type GetPracticeRegistrationsArgs = { tournamentRecord: Tournament } & RegistrationFilter;

/**
 * Walks the venues tree and returns every practice registration as a flat
 * list, optionally filtered. Cancelled registrations are excluded by default.
 */
export function getPracticeRegistrations(params: GetPracticeRegistrationsArgs): {
  registrations: PracticeRegistrationRecord[];
} {
  const { tournamentRecord, ...filter } = params ?? ({} as GetPracticeRegistrationsArgs);
  const out: PracticeRegistrationRecord[] = [];
  if (!tournamentRecord) return { registrations: out };

  for (const venue of tournamentRecord.venues ?? []) {
    for (const court of venue.courts ?? []) {
      if (filter.courtId && court.courtId !== filter.courtId) continue;
      collectCourtRegistrations({ venueId: venue.venueId, court, filter, out });
    }
  }

  return { registrations: out };
}

function collectCourtRegistrations({
  venueId,
  court,
  filter,
  out,
}: {
  venueId: string;
  court: any;
  filter: RegistrationFilter;
  out: PracticeRegistrationRecord[];
}): void {
  for (const availability of court.dateAvailability ?? []) {
    const availabilityDate = availability.date;
    if (!availabilityDate) continue;
    if (filter.date && !sameDay(availabilityDate, filter.date)) continue;
    for (const booking of availability.bookings ?? []) {
      if (booking.bookingType !== PRACTICE) continue;
      collectBookingRegistrations({
        booking,
        venueId,
        courtId: court.courtId,
        date: availabilityDate,
        filter,
        out,
      });
    }
  }
}

function collectBookingRegistrations({
  booking,
  venueId,
  courtId,
  date,
  filter,
  out,
}: {
  booking: any;
  venueId: string;
  courtId: string;
  date: string;
  filter: RegistrationFilter;
  out: PracticeRegistrationRecord[];
}): void {
  const resolvedBookingId = booking.bookingId ?? deriveBookingId({ courtId, date, startTime: booking.startTime });
  for (const registration of booking.registrations ?? []) {
    if (!filter.includeCancelled && registration.status === 'CANCELLED') continue;
    if (filter.participantId && registration.participantId !== filter.participantId) continue;
    out.push({
      registration,
      courtId,
      venueId,
      date,
      bookingId: resolvedBookingId,
      bookingStartTime: booking.startTime,
      bookingEndTime: booking.endTime,
    });
  }
}
