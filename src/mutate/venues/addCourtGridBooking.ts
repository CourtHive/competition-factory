import { getCourtDateAvailability } from '@Query/venues/getCourtDateAvailability';
import { decorateResult } from '@Functions/global/decorateResult';
import { addNotice } from '@Global/state/globalState';
import { findCourt } from '@Query/venues/findCourt';

// constants and types
import { INVALID_VALUES, COURT_NOT_FOUND, EXISTING_MATCHUPS } from '@Constants/errorConditionConstants';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

type AddCourtGridBookingArgs = {
  tournamentRecord: Tournament;
  disableNotice?: boolean;
  bookingType: string;
  courtOrder: number;
  scheduledDate: string;
  courtId: string;
  rowCount?: number;
  notes?: string;
};

/**
 * Adds a grid-based booking to a court, blocking one or more rows in the schedule grid.
 * Grid bookings use courtOrder (row number) instead of time-based startTime/endTime.
 *
 * @param courtOrder - The grid row number to start blocking (1-based)
 * @param rowCount - Number of consecutive rows to block (default: 1)
 * @param bookingType - Type of booking (e.g., 'PRACTICE', 'MAINTENANCE', 'BLOCKED')
 */
export function addCourtGridBooking(params: AddCourtGridBookingArgs): ResultType & { booking?: any } {
  const {
    tournamentRecord,
    disableNotice,
    scheduledDate,
    bookingType,
    courtOrder,
    rowCount = 1,
    courtId,
    notes,
  } = params;

  // Validate required parameters
  if (!tournamentRecord) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'tournamentRecord is required',
    });
  }
  if (!courtId) {
    return { error: COURT_NOT_FOUND };
  }
  if (!scheduledDate) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'scheduledDate is required',
    });
  }
  if (!bookingType) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'bookingType is required',
    });
  }
  if (courtOrder === undefined || courtOrder === null) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'courtOrder is required',
    });
  }

  // Validate courtOrder is positive integer
  if (!Number.isInteger(courtOrder) || courtOrder < 1) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'courtOrder must be a positive integer',
    });
  }

  // Validate rowCount is positive integer
  if (!Number.isInteger(rowCount) || rowCount < 1) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'rowCount must be a positive integer',
    });
  }

  // Find the court
  const { court, venue } = findCourt({ tournamentRecord, courtId });
  if (!court) return { error: COURT_NOT_FOUND };

  // Get or create dateAvailability for the specified date
  const courtDate = getCourtDateAvailability({ court, date: scheduledDate });

  if (!courtDate) {
    // Create new dateAvailability entry for this date
    court.dateAvailability ??= [];
    const newAvailability = {
      date: scheduledDate,
      bookings: [],
    };
    court.dateAvailability.push(newAvailability);
  }

  const targetCourtDate = getCourtDateAvailability({ court, date: scheduledDate });

  // Check for conflicts with existing grid bookings
  if (targetCourtDate.bookings) {
    for (const existingBooking of targetCourtDate.bookings) {
      if (typeof existingBooking.courtOrder === 'number') {
        const existingStart = existingBooking.courtOrder;
        const existingEnd = existingStart + (existingBooking.rowCount || 1) - 1;
        const newStart = courtOrder;
        const newEnd = courtOrder + rowCount - 1;

        // Check for overlap
        if (newStart <= existingEnd && newEnd >= existingStart) {
          return decorateResult({
            result: { error: EXISTING_MATCHUPS },
            info: `Booking conflicts with existing booking at rows ${existingStart}-${existingEnd}`,
          });
        }
      }
    }
  }

  // Add booking
  const booking = {
    courtOrder,
    rowCount,
    bookingType,
    notes,
    createdAt: new Date().toISOString(),
  };

  targetCourtDate.bookings ??= [];
  targetCourtDate.bookings.push(booking);

  if (!disableNotice && venue) {
    addNotice({
      payload: { venue, tournamentId: tournamentRecord.tournamentId },
      topic: MODIFY_VENUE,
      key: venue.venueId,
    });
  }

  return { ...SUCCESS, booking };
}
