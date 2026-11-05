import { getCourtDateAvailability } from '@Helpers/scheduling/getCourtDateAvailability';
import { decorateResult } from '@Functions/global/decorateResult';
import { addNotice } from '@Global/state/globalState';
import { findCourt } from '@Query/venues/findCourt';

// constants and types
import { INVALID_VALUES, COURT_NOT_FOUND, BOOKING_NOT_FOUND } from '@Constants/errorConditionConstants';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

type RemoveCourtGridBookingArgs = {
  tournamentRecord: Tournament;
  disableNotice?: boolean;
  scheduledDate: string;
  courtOrder: number;
  courtId: string;
};

/**
 * Removes a grid-based booking from a court.
 *
 * @param courtOrder - The grid row number where the booking starts (1-based)
 */
export function removeCourtGridBooking(params: RemoveCourtGridBookingArgs): ResultType & { booking?: any } {
  const { tournamentRecord, disableNotice, scheduledDate, courtOrder, courtId } = params;

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
  if (courtOrder === undefined || courtOrder === null) {
    return decorateResult({
      result: { error: INVALID_VALUES },
      info: 'courtOrder is required',
    });
  }

  // Find the court
  const { court, venue } = findCourt({ tournamentRecord, courtId });
  if (!court) return { error: COURT_NOT_FOUND };

  // Get dateAvailability for the specified date
  const courtDate = getCourtDateAvailability({ court, date: scheduledDate });

  if (!courtDate?.bookings) {
    return decorateResult({
      result: { error: BOOKING_NOT_FOUND },
      info: 'No bookings found for this date',
    });
  }

  // Find and remove the booking with the specified courtOrder
  const bookingIndex = courtDate.bookings.findIndex((b: any) => b.courtOrder === courtOrder);

  if (bookingIndex === -1) {
    return decorateResult({
      result: { error: BOOKING_NOT_FOUND },
      info: `No booking found at row ${courtOrder}`,
    });
  }

  const removed = courtDate.bookings.splice(bookingIndex, 1)[0];

  if (!disableNotice && venue) {
    addNotice({
      payload: { venue, tournamentId: tournamentRecord.tournamentId },
      topic: MODIFY_VENUE,
      key: venue.venueId,
    });
  }

  return { ...SUCCESS, booking: removed };
}
