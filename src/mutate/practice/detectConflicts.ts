import { allTournamentMatchUps } from '@Query/matchUps/getAllTournamentMatchUps';
import { sameDay } from '@Tools/dateTime';

// constants and types
import { completedMatchUpStatuses } from '@Constants/matchUpStatusConstants';
import { Tournament } from '@Types/tournamentTypes';

export type MatchUpConflict = {
  matchUpId: string;
  scheduledDate?: string;
  scheduledTime?: string;
};

export type PracticeConflict = {
  bookingId?: string;
  courtId: string;
  date: string;
  registrationId: string;
  startTime: string;
  endTime: string;
};

export type ConflictReport = {
  matchUps: MatchUpConflict[];
  practiceRegistrations: PracticeConflict[];
};

/**
 * Detects conflicts when registering `participantId` for a sub-window on a
 * specific date. The check is non-blocking: callers decide what to do with
 * the payload (the documented Phase-1 behavior is `warn-and-allow` via
 * confirmModal).
 *
 * Two conflict classes:
 *   - matchUps:               participant has a non-completed matchUp whose
 *                             schedule overlaps the requested window
 *   - practiceRegistrations:  participant has a CONFIRMED practice
 *                             registration on any court whose sub-window
 *                             overlaps the requested window
 *
 * `excludeRegistrationId` skips a specific registration during update flows.
 */
export function detectParticipantConflicts({
  tournamentRecord,
  participantId,
  date,
  startTime,
  endTime,
  excludeRegistrationId,
}: {
  tournamentRecord: Tournament;
  participantId: string;
  date: string;
  startTime: string;
  endTime: string;
  excludeRegistrationId?: string;
}): ConflictReport {
  const matchUps = detectMatchUpConflicts({
    tournamentRecord,
    participantId,
    date,
    startTime,
    endTime,
  });

  const practiceRegistrations = detectPracticeRegistrationConflicts({
    tournamentRecord,
    participantId,
    date,
    startTime,
    endTime,
    excludeRegistrationId,
  });

  return { matchUps, practiceRegistrations };
}

function detectMatchUpConflicts({
  tournamentRecord,
  participantId,
  date,
  startTime,
  endTime,
}: {
  tournamentRecord: Tournament;
  participantId: string;
  date: string;
  startTime: string;
  endTime: string;
}): MatchUpConflict[] {
  const { matchUps } = allTournamentMatchUps({ tournamentRecord });
  if (!matchUps) return [];

  return matchUps
    .filter((matchUp) => {
      if (completedMatchUpStatuses.includes(matchUp.matchUpStatus)) return false;
      if (matchUp.winningSide) return false;
      const { scheduledDate, scheduledTime } = matchUp.schedule ?? {};
      if (!scheduledDate || !scheduledTime) return false;
      if (!sameDay(scheduledDate, date)) return false;

      const ids = collectParticipantIds(matchUp);
      if (!ids.includes(participantId)) return false;

      // Naive sub-window overlap (matchUp window is a single scheduledTime point
      // — treat as instant; conflict if matchUp time falls inside the practice
      // window OR if practice window contains the matchUp time).
      return scheduledTime >= startTime && scheduledTime < endTime;
    })
    .map((matchUp) => ({
      matchUpId: matchUp.matchUpId,
      scheduledDate: matchUp.schedule?.scheduledDate,
      scheduledTime: matchUp.schedule?.scheduledTime,
    }));
}

type ConflictFilter = {
  participantId: string;
  date: string;
  startTime: string;
  endTime: string;
  excludeRegistrationId?: string;
};

function detectPracticeRegistrationConflicts({
  tournamentRecord,
  ...filter
}: { tournamentRecord: Tournament } & ConflictFilter): PracticeConflict[] {
  const conflicts: PracticeConflict[] = [];
  for (const venue of tournamentRecord.venues ?? []) {
    for (const court of venue.courts ?? []) {
      collectCourtConflicts({ court, filter, conflicts });
    }
  }
  return conflicts;
}

function collectCourtConflicts({
  court,
  filter,
  conflicts,
}: {
  court: any;
  filter: ConflictFilter;
  conflicts: PracticeConflict[];
}): void {
  for (const availability of court.dateAvailability ?? []) {
    const availabilityDate = availability.date;
    if (!availabilityDate || !sameDay(availabilityDate, filter.date)) continue;
    for (const booking of availability.bookings ?? []) {
      collectBookingConflicts({
        bookingId: booking.bookingId,
        registrations: booking.registrations ?? [],
        courtId: court.courtId,
        date: availabilityDate,
        filter,
        conflicts,
      });
    }
  }
}

function collectBookingConflicts({
  bookingId,
  registrations,
  courtId,
  date,
  filter,
  conflicts,
}: {
  bookingId?: string;
  registrations: any[];
  courtId: string;
  date: string;
  filter: ConflictFilter;
  conflicts: PracticeConflict[];
}): void {
  for (const registration of registrations) {
    if (!matchesConflictFilter({ registration, filter })) continue;
    conflicts.push({
      bookingId,
      courtId,
      date,
      registrationId: registration.registrationId,
      startTime: registration.startTime,
      endTime: registration.endTime,
    });
  }
}

function matchesConflictFilter({ registration, filter }: { registration: any; filter: ConflictFilter }): boolean {
  if (registration.registrationId === filter.excludeRegistrationId) return false;
  if (registration.status === 'CANCELLED') return false;
  if (registration.participantId !== filter.participantId) return false;
  if (registration.startTime >= filter.endTime) return false;
  if (registration.endTime <= filter.startTime) return false;
  return true;
}

function collectParticipantIds(matchUp: any): string[] {
  const sides = matchUp.sides ?? [];
  const ids: string[] = [];
  for (const side of sides) {
    if (side?.participantId) ids.push(side.participantId);
    const individualIds = side?.participant?.individualParticipantIds ?? [];
    ids.push(...individualIds);
  }
  return ids;
}
