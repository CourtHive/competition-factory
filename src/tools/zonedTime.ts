/**
 * Venue-local wall clock ↔ UTC instant, correct across a DST boundary.
 *
 * A single `utcOffsetMinutes` is the offset at *one* moment. Applied to a
 * tournament that spans a DST change it is wrong by an hour on the far side of
 * the change — in the US that is the March and November weekends, which do host
 * competition. The error is silent: times simply read an hour off, and a
 * recovery figure derived from them is wrong by 60 minutes in a report whose
 * whole purpose is to measure recovery in minutes.
 *
 * An IANA zone identifier (`America/New_York`) resolves the offset **per
 * instant** instead, so both sides of the change convert correctly. `Intl` is
 * built into Node and every browser, so this adds no dependency and keeps the
 * factory pure.
 *
 * Callers that supply a fixed offset keep working unchanged — the offset path is
 * still correct for a tournament that does not cross a transition, which is
 * almost all of them.
 */

const MS_PER_MINUTE = 60_000;

// `Intl.DateTimeFormat` construction is expensive relative to formatting, and a
// timeline resolves thousands of instants against a handful of zones.
const formatterCache = new Map<string, Intl.DateTimeFormat>();

function formatterFor(timeZone: string): Intl.DateTimeFormat | undefined {
  const cached = formatterCache.get(timeZone);
  if (cached) return cached;
  try {
    const formatter = new Intl.DateTimeFormat('en-US', {
      second: '2-digit',
      minute: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      day: '2-digit',
      year: 'numeric',
      hourCycle: 'h23',
      timeZone,
    });
    formatterCache.set(timeZone, formatter);
    return formatter;
  } catch {
    // An unknown or malformed zone must not throw in a report. The caller falls
    // back to its fixed offset, which is the previous behaviour rather than a
    // new failure mode.
    return undefined;
  }
}

/** The zone's offset from UTC, in minutes, **at a specific instant** (local = UTC + offset). */
export function offsetMinutesAt(ms: number, timeZone?: string): number | undefined {
  if (!timeZone) return undefined;
  const formatter = formatterFor(timeZone);
  if (!formatter) return undefined;

  const parts: Record<string, number> = {};
  for (const { type, value } of formatter.formatToParts(new Date(ms))) {
    if (type !== 'literal') parts[type] = Number(value);
  }
  if (!Number.isFinite(parts.year)) return undefined;

  // Read the zone's wall clock back as though it were UTC; the difference from
  // the true instant is the offset.
  const asIfUtc = Date.UTC(parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second);
  return Math.round((asIfUtc - ms) / MS_PER_MINUTE);
}

/**
 * Venue-local `YYYY-MM-DD` + `HH:MM` → UTC ms.
 *
 * Converting local → UTC is circular: the offset depends on the instant, and the
 * instant is what we are solving for. Resolved by interpreting the wall clock as
 * UTC, taking the offset at that approximate instant, then re-reading the offset
 * at the corrected one — which settles everywhere except inside the one
 * ambiguous hour a fall-back transition repeats, where either reading is
 * defensible and both are within an hour of the truth.
 *
 * Falls back to `utcOffsetMinutes` when no zone is supplied or the zone is not
 * recognised.
 */
export function zonedWallClockToMs({
  utcOffsetMinutes = 0,
  timeZone,
  date,
  time,
}: {
  utcOffsetMinutes?: number;
  timeZone?: string;
  date?: string;
  time?: string;
}): number | null {
  if (!date || !time) return null;
  const match = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!match) return null;
  const base = Date.parse(`${date}T00:00:00.000Z`);
  if (Number.isNaN(base)) return null;

  const naive = base + (Number(match[1]) * 60 + Number(match[2])) * MS_PER_MINUTE;

  const firstOffset = offsetMinutesAt(naive, timeZone);
  if (firstOffset === undefined) return naive - utcOffsetMinutes * MS_PER_MINUTE;

  const approximate = naive - firstOffset * MS_PER_MINUTE;
  const settledOffset = offsetMinutesAt(approximate, timeZone) ?? firstOffset;
  return naive - settledOffset * MS_PER_MINUTE;
}

/** UTC ms → venue-local calendar date + wall clock, per-instant when a zone is supplied. */
export function zonedParts({
  utcOffsetMinutes = 0,
  timeZone,
  ms,
}: {
  utcOffsetMinutes?: number;
  timeZone?: string;
  ms: number;
}): { date: string; time: string } {
  const offset = offsetMinutesAt(ms, timeZone) ?? utcOffsetMinutes;
  const shifted = new Date(ms + offset * MS_PER_MINUTE);
  const pad = (n: number) => String(n).padStart(2, '0');
  return {
    date: `${shifted.getUTCFullYear()}-${pad(shifted.getUTCMonth() + 1)}-${pad(shifted.getUTCDate())}`,
    time: `${pad(shifted.getUTCHours())}:${pad(shifted.getUTCMinutes())}`,
  };
}
