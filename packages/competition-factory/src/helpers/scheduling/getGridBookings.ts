import { getCourtDateAvailability } from './getCourtDateAvailability';

type Booking = {
  courtOrder?: number;
  rowCount?: number;
  bookingType?: string;
  startTime?: string;
  endTime?: string;
  notes?: string;
  [key: string]: any;
};

type GetGridBookingsParams = {
  court: any;
  date: string;
};

type GetGridBookingsResult = {
  gridBookings: Map<number, Booking>;
  timeBookings: Booking[];
};

/**
 * Separates court bookings into grid-based bookings (using courtOrder)
 * and time-based bookings (using startTime/endTime).
 *
 * Grid bookings are mapped by row number (courtOrder) for easy lookup.
 * If a booking has rowCount > 1, it will occupy multiple consecutive rows.
 */
export function getGridBookings({ court, date }: GetGridBookingsParams): GetGridBookingsResult {
  const courtDate = getCourtDateAvailability({ court, date });
  const gridBookings = new Map<number, Booking>();
  const timeBookings: Booking[] = [];

  (courtDate?.bookings ?? []).forEach((booking: Booking) => {
    if (typeof booking.courtOrder === 'number') {
      // Grid booking - add all blocked rows
      const rowCount = booking.rowCount || 1;
      for (let i = 0; i < rowCount; i++) {
        gridBookings.set(booking.courtOrder + i, booking);
      }
    } else {
      // Time booking
      timeBookings.push(booking);
    }
  });

  return { gridBookings, timeBookings };
}
