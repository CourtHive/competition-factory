/**
 * Time Granularity Utilities
 *
 * Canonical time granularity helpers for snapping, converting, and iterating
 * time values. These replace ad-hoc slotMinutes/periodLength logic with
 * a single authoritative granularity.
 */

// ============================================================================
// HH:MM <-> Minutes Conversion
// ============================================================================

/**
 * Convert 'HH:MM' string to minutes since midnight.
 */
export function hhmmToMinutes(hhmm: string): number {
  if (typeof hhmm !== 'string') return 0;

  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

/**
 * Convert minutes since midnight to 'HH:MM' string.
 */
export function minutesToHhmm(minutes: number): string {
  const clamped = Math.max(0, Math.min(1439, Math.round(minutes)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// ============================================================================
// Snap-to-Granularity
// ============================================================================

/**
 * Snap a minute value to the nearest granularity boundary.
 *
 * @param minutes - Minutes since midnight (or any minute value)
 * @param granularity - Granularity in minutes (e.g. 15, 30)
 * @param mode - 'floor' rounds down, 'ceil' rounds up, 'round' rounds to nearest
 */
export function snapToGranularity(
  minutes: number,
  granularity: number,
  mode: 'floor' | 'ceil' | 'round' = 'round',
): number {
  if (granularity <= 0) return minutes;

  switch (mode) {
    case 'floor':
      return Math.floor(minutes / granularity) * granularity;
    case 'ceil':
      return Math.ceil(minutes / granularity) * granularity;
    case 'round':
      return Math.round(minutes / granularity) * granularity;
  }
}

/**
 * Snap an ISO datetime's time component to the nearest granularity boundary.
 * Returns a new ISO datetime string with the snapped time.
 *
 * @param iso - ISO datetime string (e.g. '2026-06-15T10:07:00')
 * @param granularity - Granularity in minutes
 * @param mode - Rounding mode
 */
export function snapIsoToGranularity(
  iso: string,
  granularity: number,
  mode: 'floor' | 'ceil' | 'round' = 'round',
): string {
  if (!iso || typeof iso !== 'string') return iso;
  const datePart = iso.slice(0, 10); // 'YYYY-MM-DD'
  const timePart = iso.slice(11, 16); // 'HH:MM'
  const minutes = hhmmToMinutes(timePart);
  const snapped = snapToGranularity(minutes, granularity, mode);
  const hhmm = minutesToHhmm(snapped);
  return `${datePart}T${hhmm}:00`;
}

// ============================================================================
// Day Tick Iterator
// ============================================================================

/**
 * Generator that yields 'HH:MM' strings at granularity intervals
 * from startHhmm to endHhmm (inclusive of start, exclusive of end).
 *
 * @param startHhmm - Start time 'HH:MM'
 * @param endHhmm - End time 'HH:MM'
 * @param granularity - Step size in minutes
 */
export function* iterateDayTicks(
  startHhmm: string,
  endHhmm: string,
  granularity: number,
): Generator<string, void, undefined> {
  if (granularity <= 0) return;

  const startMin = hhmmToMinutes(startHhmm);
  const endMin = hhmmToMinutes(endHhmm);

  for (let m = startMin; m < endMin; m += granularity) {
    yield minutesToHhmm(m);
  }
}
