import { requireParams } from '@Helpers/parameters/requireParams';
import { findPracticeBooking } from './findPracticeBooking';
import { addNotice } from '@Global/state/globalState';

// constants and types
import { INVALID_VALUES, REGISTRATION_NOT_FOUND } from '@Constants/errorConditionConstants';
import { COURT_ID, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { Tournament } from '@Types/tournamentTypes';
import { ResultType } from '@Types/factoryTypes';

type RemovePracticeRegistrationArgs = {
  tournamentRecord: Tournament;
  courtId: string;
  date: string;
  bookingId: string;
  registrationId: string;
  disableNotice?: boolean;
};

/**
 * Removes a practice registration from a booking by registrationId. Hard
 * delete (the row is spliced out); use `updatePracticeRegistration` with
 * `status: 'CANCELLED'` to preserve audit history instead.
 */
export function removePracticeRegistration(params: RemovePracticeRegistrationArgs): ResultType {
  const { tournamentRecord, courtId, date, bookingId, registrationId, disableNotice } = params;

  const paramsCheck = requireParams({ tournamentRecord, courtId }, [TOURNAMENT_RECORD, COURT_ID]);
  if (paramsCheck.error) return paramsCheck;
  if (!date) return { error: INVALID_VALUES, info: 'date is required' };
  if (!bookingId) return { error: INVALID_VALUES, info: 'bookingId is required' };
  if (!registrationId) return { error: INVALID_VALUES, info: 'registrationId is required' };

  const found = findPracticeBooking({ tournamentRecord, courtId, date, bookingId });
  if (found.error) return { error: found.error };
  const { booking, venue } = found;
  if (!booking) return { error: INVALID_VALUES, info: 'booking lookup returned no booking' };

  const index = booking.registrations?.findIndex((r) => r.registrationId === registrationId) ?? -1;
  if (index < 0) return { error: REGISTRATION_NOT_FOUND };

  booking.registrations!.splice(index, 1);
  booking.updatedAt = new Date().toISOString();

  if (!disableNotice && venue) {
    addNotice({
      payload: { venue, tournamentId: tournamentRecord.tournamentId },
      topic: MODIFY_VENUE,
      key: venue.venueId,
    });
  }

  return { ...SUCCESS };
}
