import { countOverlappingRegistrations, resolveBookingCapacity } from './resolveCapacity';
import { detectParticipantConflicts, ConflictReport } from './detectConflicts';
import { requireParams } from '@Helpers/parameters/requireParams';
import { findPracticeBooking } from './findPracticeBooking';
import { addNotice } from '@Global/state/globalState';
import { UUID } from '@Tools/UUID';

// constants and types
import { COURT_ID, PARTICIPANT_ID, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { PracticeRegistration, Tournament } from '@Types/tournamentTypes';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  CAPACITY_EXCEEDED,
  ErrorType,
  INVALID_VALUES,
  PARTICIPANT_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type AddPracticeRegistrationArgs = {
  tournamentRecord: Tournament;
  courtId: string;
  date: string;
  bookingId: string;
  participantId: string;
  startTime: string;
  endTime: string;
  notes?: string;
  disableNotice?: boolean;
};

type AddPracticeRegistrationResult = ResultType & {
  registration?: PracticeRegistration;
  conflicts?: ConflictReport;
};

/**
 * Adds a participant registration to a PRACTICE booking sub-window.
 *
 * Capacity is enforced as a HARD reject (CAPACITY_EXCEEDED). Participant
 * double-bookings (matchUp during the slot, or another practice
 * registration on a different court) are returned as a `conflicts`
 * payload alongside the success result — never block the registration.
 * Callers (TMX) surface a confirmModal and decide whether to proceed.
 */
export function addPracticeRegistration(params: AddPracticeRegistrationArgs): AddPracticeRegistrationResult {
  const { tournamentRecord, courtId, date, bookingId, participantId, startTime, endTime, notes, disableNotice } =
    params;

  const paramsCheck = requireParams({ tournamentRecord, courtId, participantId }, [
    TOURNAMENT_RECORD,
    COURT_ID,
    PARTICIPANT_ID,
  ]);
  if (paramsCheck.error) return paramsCheck;
  if (!date) return { error: INVALID_VALUES, info: 'date is required' };
  if (!bookingId) return { error: INVALID_VALUES, info: 'bookingId is required' };
  if (!startTime || !endTime) return { error: INVALID_VALUES, info: 'startTime and endTime are required' };
  if (startTime >= endTime) return { error: INVALID_VALUES, info: 'startTime must be before endTime' };

  const participantExists = tournamentRecord.participants?.some((p) => p.participantId === participantId);
  if (!participantExists) return { error: PARTICIPANT_NOT_FOUND };

  const found = findPracticeBooking({ tournamentRecord, courtId, date, bookingId });
  if (found.error) return { error: found.error };
  const { booking, venue } = found;
  if (!booking) return { error: INVALID_VALUES, info: 'booking lookup returned no booking' };

  const insideWindow =
    (!booking.startTime || startTime >= booking.startTime) && (!booking.endTime || endTime <= booking.endTime);
  if (!insideWindow) {
    return {
      error: INVALID_VALUES,
      info: 'sub-window must fall inside the booking window',
    };
  }

  const capacityError = checkCapacity({ tournamentRecord, booking, startTime, endTime });
  if (capacityError) return { error: capacityError };

  const conflicts = detectParticipantConflicts({
    tournamentRecord,
    participantId,
    date,
    startTime,
    endTime,
  });

  const registration: PracticeRegistration = {
    registrationId: UUID('reg'),
    participantId,
    startTime,
    endTime,
    status: 'CONFIRMED',
    registeredAt: new Date().toISOString(),
    createdAt: new Date().toISOString(),
  };
  if (notes) registration.notes = notes;

  booking.registrations ??= [];
  booking.registrations.push(registration);
  booking.updatedAt = new Date().toISOString();

  if (!disableNotice && venue) {
    addNotice({
      payload: { venue, tournamentId: tournamentRecord.tournamentId },
      topic: MODIFY_VENUE,
      key: venue.venueId,
    });
  }

  const result: AddPracticeRegistrationResult = { ...SUCCESS, registration };
  if (conflicts.matchUps.length || conflicts.practiceRegistrations.length) {
    result.conflicts = conflicts;
  }
  return result;
}

function checkCapacity({
  tournamentRecord,
  booking,
  startTime,
  endTime,
}: {
  tournamentRecord: Tournament;
  booking: { capacity?: number | null; registrations?: PracticeRegistration[] };
  startTime: string;
  endTime: string;
}): ErrorType | undefined {
  const capacity = resolveBookingCapacity({ tournamentRecord, booking });
  if (capacity === null) return undefined;
  if (capacity === 0) return CAPACITY_EXCEEDED;
  const existingCount = countOverlappingRegistrations({ booking, startTime, endTime });
  if (existingCount + 1 > capacity) return CAPACITY_EXCEEDED;
  return undefined;
}
