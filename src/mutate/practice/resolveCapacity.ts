// constants and types
import { Booking, PracticeRegistrationStatusEnum, Tournament } from '@Types/tournamentTypes';

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
 * Returns the PEAK number of currently-CONFIRMED registrations present at any
 * single instant of `[startTime, endTime)` — the "max simultaneous registrants"
 * the capacity cap is measured against. CANCELLED registrations are ignored.
 *
 * Counting every registration that merely overlaps the window over-counts: with
 * 14:00–15:00 and 15:00–16:00 booked, a 14:00–16:00 request never shares an
 * instant with more than one of them. Each overlapping registration is clipped
 * to the window and swept; at equal times a departure is applied before an
 * arrival, so back-to-back registrations never coexist.
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
  const events: { time: string; delta: number }[] = [];
  for (const r of registrations) {
    if (r.registrationId === excludeRegistrationId) continue;
    if (r.status === PracticeRegistrationStatusEnum.CANCELLED) continue;
    if (!(r.startTime < endTime && r.endTime > startTime)) continue;
    const arrival = r.startTime > startTime ? r.startTime : startTime;
    const departure = r.endTime < endTime ? r.endTime : endTime;
    events.push({ time: arrival, delta: 1 }, { time: departure, delta: -1 });
  }
  events.sort((a, b) => a.time.localeCompare(b.time, 'en') || a.delta - b.delta);

  let current = 0;
  let peak = 0;
  for (const { delta } of events) {
    current += delta;
    if (current > peak) peak = current;
  }
  return peak;
}
