import { countOverlappingRegistrations, resolveBookingCapacity } from './resolveCapacity';
import { detectParticipantConflicts, ConflictReport } from './detectConflicts';
import { requireParams } from '@Helpers/parameters/requireParams';
import { findPracticeBooking } from './findPracticeBooking';
import { addNotice } from '@Global/state/globalState';

// constants and types
import { PracticeRegistration, PracticeRegistrationStatus, Tournament } from '@Types/tournamentTypes';
import { COURT_ID, TOURNAMENT_RECORD } from '@Constants/attributeConstants';
import { MODIFY_VENUE } from '@Constants/topicConstants';
import { SUCCESS } from '@Constants/resultConstants';
import { ResultType } from '@Types/factoryTypes';
import {
  CAPACITY_EXCEEDED,
  ErrorType,
  INVALID_VALUES,
  REGISTRATION_NOT_FOUND,
} from '@Constants/errorConditionConstants';

type Updates = {
  startTime?: string;
  endTime?: string;
  notes?: string;
  status?: PracticeRegistrationStatus;
};

type UpdatePracticeRegistrationArgs = {
  tournamentRecord: Tournament;
  courtId: string;
  date: string;
  bookingId: string;
  registrationId: string;
  updates: Updates;
  disableNotice?: boolean;
};

type UpdatePracticeRegistrationResult = ResultType & {
  registration?: PracticeRegistration;
  conflicts?: ConflictReport;
};

/**
 * Mutates an existing practice registration in place. Sub-window time
 * changes re-validate against the booking window + capacity + conflicts.
 * Status flips to CANCELLED stamp `cancelledAt`; flips back to CONFIRMED
 * clear it. Capacity is enforced as a HARD reject; participant conflicts
 * are returned alongside success (same posture as `addPracticeRegistration`).
 */
export function updatePracticeRegistration(params: UpdatePracticeRegistrationArgs): UpdatePracticeRegistrationResult {
  const { tournamentRecord, courtId, date, bookingId, registrationId, updates, disableNotice } = params;

  const paramsCheck = requireParams({ tournamentRecord, courtId }, [TOURNAMENT_RECORD, COURT_ID]);
  if (paramsCheck.error) return paramsCheck;
  if (!date) return { error: INVALID_VALUES, info: 'date is required' };
  if (!bookingId) return { error: INVALID_VALUES, info: 'bookingId is required' };
  if (!registrationId) return { error: INVALID_VALUES, info: 'registrationId is required' };
  if (!updates || !Object.keys(updates).length) {
    return { error: INVALID_VALUES, info: 'updates payload is required' };
  }

  const found = findPracticeBooking({ tournamentRecord, courtId, date, bookingId });
  if (found.error) return { error: found.error };
  const { booking, venue } = found;
  if (!booking) return { error: INVALID_VALUES, info: 'booking lookup returned no booking' };

  const registration = booking.registrations?.find((r) => r.registrationId === registrationId);
  if (!registration) return { error: REGISTRATION_NOT_FOUND };

  const nextStartTime = updates.startTime ?? registration.startTime;
  const nextEndTime = updates.endTime ?? registration.endTime;
  if (nextStartTime >= nextEndTime) {
    return { error: INVALID_VALUES, info: 'startTime must be before endTime' };
  }

  const insideWindow =
    (!booking.startTime || nextStartTime >= booking.startTime) && (!booking.endTime || nextEndTime <= booking.endTime);
  if (!insideWindow) {
    return { error: INVALID_VALUES, info: 'sub-window must fall inside the booking window' };
  }

  const nextStatus: PracticeRegistrationStatus = updates.status ?? registration.status ?? 'CONFIRMED';
  const becomesActive = nextStatus === 'CONFIRMED';

  if (becomesActive) {
    const capacityError = checkCapacityForUpdate({
      tournamentRecord,
      booking,
      startTime: nextStartTime,
      endTime: nextEndTime,
      excludeRegistrationId: registrationId,
    });
    if (capacityError) return { error: capacityError };
  }

  registration.startTime = nextStartTime;
  registration.endTime = nextEndTime;
  registration.status = nextStatus;
  if (updates.notes !== undefined) registration.notes = updates.notes;
  if (nextStatus === 'CANCELLED') {
    registration.cancelledAt = new Date().toISOString();
  } else {
    delete registration.cancelledAt;
  }
  registration.updatedAt = new Date().toISOString();
  booking.updatedAt = registration.updatedAt;

  if (!disableNotice && venue) {
    addNotice({
      payload: { venue, tournamentId: tournamentRecord.tournamentId },
      topic: MODIFY_VENUE,
      key: venue.venueId,
    });
  }

  const result: UpdatePracticeRegistrationResult = { ...SUCCESS, registration };

  if (becomesActive) {
    const conflicts = detectParticipantConflicts({
      tournamentRecord,
      participantId: registration.participantId,
      date,
      startTime: nextStartTime,
      endTime: nextEndTime,
      excludeRegistrationId: registrationId,
    });
    if (conflicts.matchUps.length || conflicts.practiceRegistrations.length) {
      result.conflicts = conflicts;
    }
  }

  return result;
}

function checkCapacityForUpdate({
  tournamentRecord,
  booking,
  startTime,
  endTime,
  excludeRegistrationId,
}: {
  tournamentRecord: Tournament;
  booking: { capacity?: number | null; registrations?: PracticeRegistration[] };
  startTime: string;
  endTime: string;
  excludeRegistrationId: string;
}): ErrorType | undefined {
  const capacity = resolveBookingCapacity({ tournamentRecord, booking });
  if (capacity === null) return undefined;
  if (capacity === 0) return CAPACITY_EXCEEDED;
  const existingCount = countOverlappingRegistrations({
    booking,
    startTime,
    endTime,
    excludeRegistrationId,
  });
  if (existingCount + 1 > capacity) return CAPACITY_EXCEEDED;
  return undefined;
}
