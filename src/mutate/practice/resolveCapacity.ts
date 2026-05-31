// constants and types
import { Booking, Tournament } from '@Types/tournamentTypes';

/**
 * Resolves the effective capacity for a PRACTICE booking:
 *   `null` (or omitted) → unlimited
 *   `0`                 → closed
 *   positive integer    → cap
 *
 * Per-booking `booking.capacity` overrides
 * `tournament.scheduling?.practice?.defaultCapacity`.
 * If neither is set, capacity is unlimited.
 */
export function resolveBookingCapacity({
  tournamentRecord,
  booking,
}: {
  tournamentRecord: Tournament;
  booking: Booking;
}): number | null {
  if (booking.capacity !== undefined) return booking.capacity;
  const fallback = tournamentRecord.scheduling?.practice?.defaultCapacity;
  return fallback ?? null;
}

/**
 * Counts the number of currently-CONFIRMED registrations whose sub-window
 * overlaps `[startTime, endTime)`. CANCELLED registrations are ignored.
 */
export function countOverlappingRegistrations({
  booking,
  startTime,
  endTime,
  excludeRegistrationId,
}: {
  booking: Booking;
  startTime: string;
  endTime: string;
  excludeRegistrationId?: string;
}): number {
  const registrations = booking.registrations ?? [];
  return registrations.filter((r) => {
    if (r.registrationId === excludeRegistrationId) return false;
    if (r.status === 'CANCELLED') return false;
    return r.startTime < endTime && r.endTime > startTime;
  }).length;
}
